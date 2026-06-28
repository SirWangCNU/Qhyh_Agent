/* ============================================================
   agents.js · Agent 管理页面
   负责：6 张 Agent 卡片渲染、详情面板、单 Agent 运行、状态追踪
   依赖：agent-renderers.js, workshop.js（可选）
   暴露：window.Qinghe.agents
   ============================================================ */

window.Qinghe = window.Qinghe || {};

(function (Q) {
  "use strict";

  var BACKEND_URL = ((window.__QINGHE_CONFIG__ && window.__QINGHE_CONFIG__.BACKEND_URL) || "http://localhost:18739").replace(/\/+$/, "");
  var AGENT_API = BACKEND_URL + "/api/agents/";

  var AGENTS = [
    {
      key: "planner",
      num: "01",
      name: "策划",
      en: "PLANNER",
      desc: "确定主题方向、核心卖点与目标受众，为后续创作奠基。",
      tagline: "主题、受众、卖点",
      avatar: "📋",
      avatarClass: "agent-card__avatar--planner"
    },
    {
      key: "copywriter",
      num: "02",
      name: "文案",
      en: "COPYWRITER",
      desc: "撰写 Hook、口播正文与行动号召，让产品故事更有感染力。",
      tagline: "Hook、口播、CTA",
      avatar: "✍️",
      avatarClass: "agent-card__avatar--copywriter"
    },
    {
      key: "scriptwriter",
      num: "03",
      name: "脚本",
      en: "SCRIPTWRITER",
      desc: "把文案拆成可拍摄的分镜脚本、运镜与 BGM 建议。",
      tagline: "分镜、运镜、BGM",
      avatar: "🎬",
      avatarClass: "agent-card__avatar--scriptwriter"
    },
    {
      key: "visual_designer",
      num: "04",
      name: "视觉",
      en: "VISUAL DESIGNER",
      desc: "为每个镜头生成英文 AI 生图 / 生视频 Prompt。",
      tagline: "图片 / 视频 Prompt",
      avatar: "🎨",
      avatarClass: "agent-card__avatar--visual"
    },
    {
      key: "distributor",
      num: "05",
      name: "投放",
      en: "DISTRIBUTOR",
      desc: "制定标题、标签、发布时间与平台推广策略。",
      tagline: "标题、标签、策略",
      avatar: "📣",
      avatarClass: "agent-card__avatar--distributor"
    },
    {
      key: "report_generator",
      num: "06",
      name: "报告",
      en: "REPORT",
      desc: "汇总各 Agent 输出，生成完整 Markdown 创作方案。",
      tagline: "汇总成完整方案",
      avatar: "📄",
      avatarClass: "agent-card__avatar--report"
    }
  ];

  // DOM 引用
  var gridEl = document.getElementById("agentsGrid");
  var detailEl = document.getElementById("agentDetail");
  var detailAvatarEl = document.getElementById("detailAvatar");
  var detailTitleEl = document.getElementById("detailTitle");
  var detailKickerEl = document.getElementById("detailKicker");
  var detailDescEl = document.getElementById("detailDesc");
  var detailStatusEl = document.getElementById("detailStatus");
  var formEl = document.getElementById("agentForm");
  var outputEl = document.getElementById("agentOutput");
  var runBtn = document.getElementById("runAgentBtn");
  var workshopLink = document.getElementById("openInWorkshop");

  // 状态：每个 Agent 的输入、输出、运行状态
  var selectedKey = null;
  var agentInputs = {};   // { planner: { product_name, ... }, ... }
  var agentOutputs = {};  // { planner: htmlString, ... }
  var agentStatus = {};   // { planner: "idle"|"loading"|"success"|"error", ... }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getAgent(key) {
    return AGENTS.filter(function (a) { return a.key === key; })[0];
  }

  function statusLabel(status) {
    switch (status) {
      case "loading": return "运行中";
      case "success": return "成功";
      case "error": return "错误";
      default: return "空闲";
    }
  }

  function readGlobalForm() {
    function get(id, fallback) {
      var el = document.getElementById(id);
      return el ? (el.value || "").trim() : (fallback || "");
    }
    return {
      product_name: get("product_name"),
      origin: get("origin"),
      category: get("category"),
      selling_points: get("selling_points"),
      target_platform: get("target_platform", "抖音"),
      target_duration: get("target_duration", "30-60秒"),
      additional_info: get("additional_info", "")
    };
  }

  function readAgentForm() {
    function get(id, fallback) {
      var el = document.getElementById("agent_" + id);
      return el ? (el.value || "").trim() : (fallback || "");
    }
    return {
      product_name: get("product_name"),
      origin: get("origin"),
      category: get("category"),
      selling_points: get("selling_points"),
      target_platform: get("target_platform", "抖音"),
      target_duration: get("target_duration", "30-60秒"),
      additional_info: get("additional_info", "")
    };
  }

  function setAgentForm(values) {
    var v = values || {};
    ["product_name", "origin", "category", "selling_points", "target_platform", "target_duration", "additional_info"].forEach(function (key) {
      var el = document.getElementById("agent_" + key);
      if (el) el.value = v[key] == null ? "" : v[key];
    });
  }

  function updateStatusBadge(key, status) {
    agentStatus[key] = status;
    var card = gridEl ? gridEl.querySelector('.agent-card[data-step="' + key + '"]') : null;
    if (card) {
      var badge = card.querySelector(".agent-card__status");
      if (badge) {
        badge.setAttribute("data-status", status);
        badge.textContent = statusLabel(status);
      }
      card.classList.toggle("is-error", status === "error");
    }
    if (selectedKey === key && detailStatusEl) {
      detailStatusEl.setAttribute("data-status", status);
      detailStatusEl.textContent = statusLabel(status);
    }
  }

  function renderAgentGrid() {
    if (!gridEl) return;
    gridEl.innerHTML = AGENTS.map(function (a) {
      var status = agentStatus[a.key] || "idle";
      return (
        '<button type="button" class="agent-card" data-step="' + escapeHtml(a.key) + '">'
        + '<div class="agent-card__head">'
        + '<span class="agent-card__avatar ' + a.avatarClass + '">' + a.avatar + '</span>'
        + '<span class="agent-card__status" data-status="' + status + '">' + statusLabel(status) + '</span>'
        + '</div>'
        + '<div class="agent-card__title">'
        + '<strong>' + escapeHtml(a.name) + '</strong>'
        + '<small>' + escapeHtml(a.en) + '</small>'
        + '</div>'
        + '<p class="agent-card__desc">' + escapeHtml(a.desc) + '</p>'
        + '</button>'
      );
    }).join("");
  }

  function emptyOutputHtml(meta) {
    return (
      '<div class="agent-output-host__empty">'
      + '<svg viewBox="0 0 48 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
      + '<path d="M24 62V28" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      + '<ellipse cx="24" cy="10" rx="4" ry="6" fill="currentColor" opacity="0.7"/>'
      + '<ellipse cx="18" cy="14" rx="3.5" ry="5.5" fill="currentColor" opacity="0.6" transform="rotate(-25 18 14)"/>'
      + '<ellipse cx="30" cy="14" rx="3.5" ry="5.5" fill="currentColor" opacity="0.6" transform="rotate(25 30 14)"/>'
      + '<path d="M24 36 Q14 32 10 40" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.5"/>'
      + '<path d="M24 36 Q34 32 38 40" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.5"/>'
      + '</svg>'
      + '<p>选择 <strong>' + escapeHtml(meta.name) + '</strong> 后，填写上方表单并点击「运行 Agent」。</p>'
      + '</div>'
    );
  }

  function selectAgent(stepKey) {
    var meta = getAgent(stepKey);
    if (!meta || !detailEl) return;

    selectedKey = stepKey;

    // 高亮当前卡片
    gridEl.querySelectorAll(".agent-card").forEach(function (card) {
      card.classList.toggle("is-active", card.getAttribute("data-step") === stepKey);
    });

    // 填充详情面板
    detailEl.classList.remove("is-hidden");
    if (detailAvatarEl) {
      detailAvatarEl.textContent = meta.avatar;
      detailAvatarEl.className = "agent-detail__avatar " + meta.avatarClass;
    }
    if (detailTitleEl) detailTitleEl.textContent = meta.name + " Agent";
    if (detailKickerEl) detailKickerEl.textContent = meta.en;
    if (detailDescEl) detailDescEl.textContent = meta.desc;

    // 恢复表单：优先用当前 Agent 缓存，其次用全局表单
    var cached = agentInputs[stepKey];
    setAgentForm(cached || readGlobalForm());

    // 恢复输出
    if (outputEl) {
      outputEl.classList.remove("is-loading", "is-error");
      if (agentOutputs[stepKey]) {
        outputEl.innerHTML = agentOutputs[stepKey];
      } else {
        outputEl.innerHTML = emptyOutputHtml(meta);
      }
    }

    updateStatusBadge(stepKey, agentStatus[stepKey] || "idle");

    // 更新「在分步工坊中打开」链接
    if (workshopLink) {
      workshopLink.setAttribute("data-step", stepKey);
    }
  }

  function renderAgentOutputFallback(stepKey, output) {
    try {
      return '<pre class="agent-output__fallback">' + escapeHtml(JSON.stringify(output, null, 2)) + '</pre>';
    } catch (e) {
      return '<pre class="agent-output__fallback">' + escapeHtml(String(output)) + '</pre>';
    }
  }

  function runAgent(stepKey) {
    var meta = getAgent(stepKey);
    if (!meta) return;

    var input = readAgentForm();
    agentInputs[stepKey] = input;

    if (!input.product_name || !input.origin || !input.category || !input.selling_points) {
      updateStatusBadge(stepKey, "error");
      if (outputEl) {
        outputEl.classList.add("is-error");
        outputEl.textContent = "请填写产品名称、产地、品类与卖点后再运行。";
      }
      return;
    }

    updateStatusBadge(stepKey, "loading");
    if (outputEl) {
      outputEl.classList.remove("is-error");
      outputEl.classList.add("is-loading");
      outputEl.textContent = "⏳ 正在运行 " + meta.name + " Agent…";
    }
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.textContent = "运行中…";
    }

    fetch(AGENT_API + stepKey, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: input, state: {} })
    }).then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function (t) {
          throw new Error("HTTP " + resp.status + (t ? " - " + t : ""));
        });
      }
      return resp.json();
    }).then(function (data) {
      if (data.status === "success") {
        updateStatusBadge(stepKey, "success");
        var renderer = Q.agentRender && Q.agentRender.renderAgentOutput;
        var html = renderer ? renderer(stepKey, data.output) : renderAgentOutputFallback(stepKey, data.output);
        agentOutputs[stepKey] = html;
        if (outputEl) {
          outputEl.classList.remove("is-loading");
          outputEl.innerHTML = html;
        }
      } else {
        throw new Error(data.error || "未知错误");
      }
    }).catch(function (err) {
      var msg = err && err.message ? err.message : String(err);
      if (/Failed to fetch/i.test(msg)) msg = "无法连接后端（" + BACKEND_URL + "），请确认服务已启动";
      updateStatusBadge(stepKey, "error");
      if (outputEl) {
        outputEl.classList.remove("is-loading");
        outputEl.classList.add("is-error");
        outputEl.textContent = "运行出错：" + msg;
      }
    }).finally(function () {
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.textContent = "运行 Agent";
      }
    });
  }

  function init() {
    AGENTS.forEach(function (a) {
      if (!agentStatus[a.key]) agentStatus[a.key] = "idle";
    });

    renderAgentGrid();

    if (gridEl) {
      gridEl.addEventListener("click", function (e) {
        var card = e.target.closest(".agent-card");
        if (!card) return;
        selectAgent(card.getAttribute("data-step"));
      });
    }

    if (runBtn) {
      runBtn.addEventListener("click", function () {
        if (selectedKey) runAgent(selectedKey);
      });
    }

    if (formEl) {
      formEl.addEventListener("submit", function (e) {
        e.preventDefault();
        if (selectedKey) runAgent(selectedKey);
      });
    }

    if (workshopLink) {
      workshopLink.addEventListener("click", function (e) {
        var step = workshopLink.getAttribute("data-step");
        if (step && Q.workshop && typeof Q.workshop.setActiveStep === "function") {
          // 先让 workshop 完成初始化并切到对应步骤
          setTimeout(function () {
            Q.workshop.setActiveStep(step);
          }, 0);
        }
      });
    }
  }

  // 暴露接口
  Q.agents = {
    AGENTS: AGENTS,
    renderAgentGrid: renderAgentGrid,
    selectAgent: selectAgent,
    runAgent: runAgent,
    getStatus: function (key) { return agentStatus[key] || "idle"; }
  };

  // 初始化（DOM 已就绪，因为脚本放在 body 末尾）
  init();
})(window.Qinghe);
