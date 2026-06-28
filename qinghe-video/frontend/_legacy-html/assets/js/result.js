/* ============================================================
   result.js · 结果展示模块
   负责：Tab 切换、Markdown 渲染、JSON 高亮、下载
   ============================================================ */

window.Qinghe = window.Qinghe || {};

(function (Q) {
  "use strict";

  var resultSection = document.getElementById("result");
  var reportView = document.getElementById("reportView");
  var jsonView = document.getElementById("jsonView");
  var resultTitle = document.getElementById("resultTitle");
  var resultTaskId = document.getElementById("resultTaskId");
  var imageGallery = document.getElementById("imageGallery");
  var generateImagesBtn = document.getElementById("generateImages");
  var IMAGE_API = ((window.__QINGHE_CONFIG__ && window.__QINGHE_CONFIG__.BACKEND_URL) || "http://localhost:18739").replace(/\/+$/, "") + "/api/images/generate";

  // 主 Tab 切换
  var mainTabs = document.getElementById("mainTabs");
  if (mainTabs) {
    mainTabs.addEventListener("click", function (e) {
      var tab = e.target.closest(".tab");
      if (!tab) return;
      var target = tab.getAttribute("data-tab");
      mainTabs.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("is-active"); });
      tab.classList.add("is-active");
      document.getElementById("panel-report").classList.toggle("is-active", target === "report");
      document.getElementById("panel-structured").classList.toggle("is-active", target === "structured");
    });
  }

  // 子 Tab 切换（结构化 JSON）
  var subTabs = document.getElementById("subTabs");
  var currentSub = "planner";
  var structuredData = {};

  if (subTabs) {
    subTabs.addEventListener("click", function (e) {
      var sub = e.target.closest(".subtab");
      if (!sub) return;
      currentSub = sub.getAttribute("data-sub");
      subTabs.querySelectorAll(".subtab").forEach(function (t) { t.classList.remove("is-active"); });
      sub.classList.add("is-active");
      renderJson(currentSub);
    });
  }

  // 极简 Markdown 渲染（不依赖外部库）
  function renderMarkdown(md) {
    if (!md) return '<p style="color:var(--color-ink-faint)">暂无报告</p>';
    var html = md;
    // 转义 HTML
    html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // 标题
    html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
    // 粗体 / 斜体
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    // 行内代码
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    // 引用
    html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
    // 水平线
    html = html.replace(/^---$/gm, "<hr/>");
    // 无序列表
    html = html.replace(/^(\s*)[-*] (.+)$/gm, function (m, indent, content) {
      return '<li data-indent="' + indent.length + '">' + content + "</li>";
    });
    // 有序列表
    html = html.replace(/^(\s*)\d+\. (.+)$/gm, function (m, indent, content) {
      return '<li data-indent="' + indent.length + '">' + content + "</li>";
    });
    // 合并连续 li
    html = html.replace(/(<li[^>]*>.*?<\/li>)(\s*)(?=<li)/g, function (m) { return m; });
    html = html.replace(/(<li[^>]*>[\s\S]*?<\/li>)(?!<\/li>)(?!\s*<li)/g, function (block) {
      return "<ul>" + block + "</ul>";
    });
    // 段落：剩余的连续非空行
    html = html.split(/\n\n+/).map(function (block) {
      block = block.trim();
      if (!block) return "";
      if (/^<(h\d|ul|ol|blockquote|hr|pre)/.test(block)) return block;
      if (block.indexOf("<li") === 0) return "<ul>" + block + "</ul>";
      return "<p>" + block.replace(/\n/g, "<br/>") + "</p>";
    }).join("\n");
    return html;
  }

  // JSON 语法高亮
  function syntaxHighlight(json) {
    if (typeof json !== "string") {
      try { json = JSON.stringify(json, null, 2); }
      catch (e) { json = String(json); }
    }
    json = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return json.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      function (match) {
        var cls = "n";
        if (/^"/.test(match)) {
          cls = /:$/.test(match) ? "k" : "s";
        } else if (/true|false/.test(match)) {
          cls = "b";
        } else if (/null/.test(match)) {
          cls = "b";
        }
        return '<span class="' + cls + '">' + match + "</span>";
      }
    );
  }

  // 渲染 JSON 子面板
  function renderJson(sub) {
    var key = sub + "_output";
    var data = structuredData[key] || {};
    if (jsonView) jsonView.innerHTML = syntaxHighlight(data);
  }

  // 显示结果
  function show(result, taskId) {
    structuredData = result || {};
    if (resultTitle) resultTitle.textContent = "创作方案";
    if (resultTaskId) resultTaskId.textContent = "Task " + (taskId || "—");
    // 渲染报告
    if (reportView) reportView.innerHTML = renderMarkdown(result.final_report);
    // 渲染默认 JSON
    renderJson(currentSub);
    // 显示结果区
    if (resultSection) resultSection.classList.remove("is-hidden");
    // 滚动到结果
    setTimeout(function () {
      if (resultSection) resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  // 下载文件
  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 100);
  }

  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function getShotPrompts() {
    var visual = structuredData.visual_output || {};
    var prompts = visual.shot_prompts || [];
    return prompts.filter(function (item) { return item && item.prompt; }).slice(0, 4);
  }

  function setImageButton(text, disabled) {
    if (!generateImagesBtn) return;
    generateImagesBtn.disabled = !!disabled;
    generateImagesBtn.querySelector("span") ? generateImagesBtn.querySelector("span").textContent = text : generateImagesBtn.lastChild.textContent = text;
  }

  function renderImageCard(promptItem, image) {
    var url = image && image.url;
    var b64 = image && image.b64_json;
    var src = url || (b64 ? "data:image/png;base64," + b64 : "");
    if (!src) return "";
    return '<article class="image-card">'
      + '<img src="' + escapeHtml(src) + '" alt="镜头 ' + escapeHtml(promptItem.shot_id) + ' 生成图" loading="lazy" />'
      + '<div class="image-card__body">'
      + '<div class="image-card__title">镜头 ' + escapeHtml(promptItem.shot_id || "—") + '</div>'
      + '<p class="image-card__prompt">' + escapeHtml(promptItem.prompt) + '</p>'
      + (url ? '<a class="image-card__link" href="' + escapeHtml(url) + '" target="_blank" rel="noopener">打开原图</a>' : '')
      + '</div></article>';
  }

  function generateImages() {
    var prompts = getShotPrompts();
    if (!prompts.length) {
      if (imageGallery) {
        imageGallery.classList.remove("is-hidden");
        imageGallery.innerHTML = '<p style="color:var(--color-ink-faint)">暂无可用于生图的视觉 Prompt，请先生成完整创作方案。</p>';
      }
      return;
    }

    if (imageGallery) {
      imageGallery.classList.remove("is-hidden");
      imageGallery.innerHTML = '<p style="color:var(--color-ink-soft)">正在生成图片素材，请稍候…</p>';
    }
    setImageButton("生成中…", true);

    Promise.all(prompts.map(function (item) {
      return fetch(IMAGE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: item.prompt,
          negative_prompt: item.negative_prompt || "",
          size: "1920x1920",
          n: 1
        })
      }).then(function (resp) {
        if (!resp.ok) {
          return resp.text().then(function (text) { throw new Error(text || ("HTTP " + resp.status)); });
        }
        return resp.json();
      }).then(function (data) {
        return { prompt: item, image: data.images && data.images[0] };
      });
    })).then(function (items) {
      if (imageGallery) {
        imageGallery.innerHTML = items.map(function (item) { return renderImageCard(item.prompt, item.image); }).join("");
      }
    }).catch(function (err) {
      if (imageGallery) {
        imageGallery.innerHTML = '<p style="color:var(--color-warn)">图片生成失败：' + escapeHtml(err.message || err) + '</p>';
      }
      console.error("[青禾] 图片生成失败", err);
    }).finally(function () {
      setImageButton("生成分镜图片", false);
    });
  }

  // 绑定下载按钮
  var dlMd = document.getElementById("dlMarkdown");
  var dlJson = document.getElementById("dlJson");
  if (dlMd) dlMd.addEventListener("click", function () {
    var md = (structuredData.final_report || "") ;
    download("qinghe_report_" + (resultTaskId.textContent || "").replace(/\s/g, "_") + ".md", md, "text/markdown;charset=utf-8");
  });
  if (dlJson) dlJson.addEventListener("click", function () {
    var json = JSON.stringify(structuredData, null, 2);
    download("qinghe_result_" + (resultTaskId.textContent || "").replace(/\s/g, "_") + ".json", json, "application/json;charset=utf-8");
  });
  if (generateImagesBtn) generateImagesBtn.addEventListener("click", generateImages);

  // 暴露接口
  Q.result = {
    show: show,
    renderMarkdown: renderMarkdown,
    syntaxHighlight: syntaxHighlight
  };
})(window.Qinghe);
