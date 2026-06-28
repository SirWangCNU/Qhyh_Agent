/* ============================================================
   app.js · 主逻辑
   负责：配置加载、健康检查、SSE 流式生成、状态编排
   依赖：pipeline.js / form.js / result.js
   ============================================================ */

(function () {
  "use strict";

  var Q = window.Qinghe;
  if (!Q) { console.error("[青禾] 模块未加载"); return; }

  // ---------- 配置 ----------
  // 后端地址：优先读取 window.__QINGHE_CONFIG__，其次默认本地
  var BACKEND_URL = (window.__QINGHE_CONFIG__ && window.__QINGHE_CONFIG__.BACKEND_URL) || "http://localhost:18739";
  BACKEND_URL = BACKEND_URL.replace(/\/+$/, "");
  var GENERATE_STREAM_API = BACKEND_URL + "/api/generate/stream";
  var HEALTH_API = BACKEND_URL + "/api/health";

  // ---------- 健康检查 ----------
  var healthPill = document.getElementById("healthPill");
  var healthText = document.getElementById("healthText");

  function setHealth(state, text) {
    if (!healthPill) return;
    healthPill.classList.remove("is-ok", "is-err");
    if (state) healthPill.classList.add(state);
    if (healthText) healthText.textContent = text;
  }

  // fetch 超时封装（AbortController）
  function fetchWithTimeout(url, opts, ms) {
    var ctrl = new AbortController();
    opts = opts || {};
    opts.signal = ctrl.signal;
    var timer = setTimeout(function () { ctrl.abort(); }, ms || 30000);
    return fetch(url, opts).finally(function () { clearTimeout(timer); });
  }

  function checkHealth() {
    setHealth("", "检测中");
    fetchWithTimeout(HEALTH_API, { method: "GET", mode: "cors" }, 8000)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function () { setHealth("is-ok", "后端在线"); })
      .catch(function (err) {
        console.warn("[青禾] 健康检查失败", err);
        setHealth("is-err", "后端离线");
      });
  }

  // ---------- SSE 流解析 ----------
  function parseSSEStream(response, onEvent) {
    var reader = response.body.getReader();
    var decoder = new TextDecoder("utf-8");
    var buffer = "";

    function processBuffer() {
      var parts = buffer.split("\n\n");
      buffer = parts.pop(); // 最后一段可能不完整
      for (var i = 0; i < parts.length; i++) {
        var block = parts[i];
        if (!block.trim()) continue;
        var event = null;
        var dataParts = [];
        var lines = block.split("\n");
        for (var j = 0; j < lines.length; j++) {
          var line = lines[j];
          if (line.indexOf("event:") === 0) {
            event = line.slice(6).trim();
          } else if (line.indexOf("data:") === 0) {
            dataParts.push(line.slice(5).trim());
          }
        }
        if (event !== null && dataParts.length) {
          try {
            var data = JSON.parse(dataParts.join(""));
            onEvent(event, data);
          } catch (e) {
            console.error("[青禾] SSE 解析失败", e, dataParts.join(""));
          }
        }
      }
    }

    function pump() {
      return reader.read().then(function (chunk) {
        if (chunk.done) {
          if (buffer.trim()) processBuffer();
          return;
        }
        buffer += decoder.decode(chunk.value, { stream: true });
        processBuffer();
        return pump();
      });
    }

    return pump();
  }

  // ---------- 生成流程 ----------
  var form = Q.form;
  var pipeline = Q.pipeline;
  var result = Q.result;
  var sidebar = Q.sidebar;

  function startGenerate() {
    // 校验
    var v = form.validate();
    if (!v.ok) {
      pipeline.setStatus('<strong style="color:var(--color-warn)">' + v.message + "</strong>", "error");
      var el = document.getElementById(v.field);
      if (el) { el.focus(); el.scrollIntoView({ behavior: "smooth", block: "center" }); }
      return;
    }

    var payload = v.data;

    // 重置并锁定
    if (sidebar) { sidebar.showProgress(); sidebar.resetProgress(); }
    pipeline.resetNodes();
    pipeline.setProgress(0, "正在连接后端…");
    pipeline.setStatus("正在连接后端服务…");
    form.setLocked(true);

    var completedNodes = {};
    var currentNode = null;
    var errorNode = null;
    var taskId = null;
    var finalResult = null;
    var errorMsg = null;

    // 直接发起 SSE 流式请求（不再预检，避免被 uvicorn reload 抖动误判）
    fetch(GENERATE_STREAM_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
      },
      body: JSON.stringify(payload)
    })
      .then(function (resp) {
        if (!resp.ok) {
          return resp.text().then(function (t) {
            throw new Error("流式生成失败：HTTP " + resp.status + (t ? " - " + t : ""));
          });
        }
        return parseSSEStream(resp, function (event, data) {
          if (event === "start") {
            taskId = data.task_id;
            pipeline.setProgress(0, "流水线已启动");
            pipeline.setStatus('Task ID: <strong>' + (taskId || "—") + "</strong> · 流水线已启动");

          } else if (event === "node_start") {
            currentNode = data.node;
            var idx = pipeline.nodeIndex(currentNode);
            var ratio = idx / pipeline.nodeCount();
            pipeline.setNodeState(currentNode, "active");
            pipeline.setProgress(ratio, "正在执行：" + pipeline.nodeLabel(currentNode));
            pipeline.setStatus("正在执行：<strong>" + pipeline.nodeLabel(currentNode) + "</strong> Agent");

          } else if (event === "node_update") {
            var node = data.node;
            if (node) {
              completedNodes[node] = true;
              pipeline.setNodeState(node, "done");
              currentNode = null;
            }

          } else if (event === "error") {
            errorNode = data.node || currentNode;
            errorMsg = data.error;
            if (errorNode) pipeline.setNodeState(errorNode, "error");
            pipeline.setStatus(
              "节点 <strong>" + pipeline.nodeLabel(errorNode) + "</strong> 执行出错：" + (errorMsg || "未知错误"),
              "error"
            );

          } else if (event === "complete") {
            taskId = data.task_id || taskId;
            finalResult = data.result || {};
            pipeline.setProgress(1, "流水线执行完成");
            pipeline.NODES.forEach(function (n) {
              if (!completedNodes[n.key] && n.key !== errorNode) {
                pipeline.setNodeState(n.key, "done");
              }
            });
            pipeline.setStatus("✅ 创作方案生成完成 · Task " + (taskId || "—"), "success");
            if (sidebar) sidebar.refresh();
            if (finalResult) result.show(finalResult, taskId);
          }
        });
      })
      .then(function () {
        form.setLocked(false);
        if (!finalResult && errorMsg) {
          pipeline.setStatus("生成失败：<strong>" + errorMsg + "</strong>", "error");
        }
      })
      .catch(function (err) {
        form.setLocked(false);
        var msg = err && err.message ? err.message : String(err);
        if (err && err.name === "AbortError") {
          msg = "请求超时（超过 30s 未响应）";
        } else if (err && /Failed to fetch/i.test(msg)) {
          msg = "无法连接后端（" + BACKEND_URL + "），请确认后端已启动";
        }
        pipeline.setStatus("请求失败：<strong>" + msg + "</strong>", "error");
        console.error("[青禾] 生成失败", err);
      });
  }

  // 绑定表单提交
  if (form.el) {
    form.el.addEventListener("submit", function (e) {
      e.preventDefault();
      startGenerate();
    });
  }

  // ---------- 入场动画（IntersectionObserver） ----------
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("is-in"); });
  }

  // ---------- 启动 ----------
  checkHealth();
  setInterval(checkHealth, 30000);

})();
