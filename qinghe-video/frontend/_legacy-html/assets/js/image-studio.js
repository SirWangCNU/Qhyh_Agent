/* ============================================================
   image-studio.js · 图像处理工作室（九宫格导演板）
   负责：表单提交、骨架卡片、9 格渲染、九宫格预览
   依赖：window.Qinghe.auth（auth.js 全局 fetch 拦截器自动注入 token）
   挂载：window.Qinghe.imageStudio
   ============================================================ */

window.Qinghe = window.Qinghe || {};

(function (Q) {
  "use strict";

  var BACKEND_URL = ((window.__QINGHE_CONFIG__ && window.__QINGHE_CONFIG__.BACKEND_URL) || "http://localhost:18739").replace(/\/+$/, "");
  var STUDIO_API = BACKEND_URL + "/api/image-studio/generate";

  var form = document.getElementById("studioForm");
  var submitBtn = document.getElementById("studioSubmit");
  var statusEl = document.getElementById("studioStatus");
  var gridEl = document.getElementById("studioGrid");
  var resultEl = document.getElementById("studioResult");
  var fileInput = document.getElementById("studioImage");
  var uploadHint = document.getElementById("studioUploadHint");
  var uploadBox = document.getElementById("studioUpload");

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function resolveUrl(url) {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    return BACKEND_URL + (url.charAt(0) === "/" ? "" : "/") + url;
  }

  function showStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.classList.remove("is-hidden", "studio-status--error");
    if (isError) statusEl.classList.add("studio-status--error");
    statusEl.textContent = msg;
  }

  function hideStatus() {
    if (statusEl) statusEl.classList.add("is-hidden");
  }

  // 文件选择预览
  function handleFileChange() {
    if (!fileInput || !uploadHint) return;
    var file = fileInput.files && fileInput.files[0];
    if (!file) {
      uploadHint.textContent = "点击或拖拽图片到此处";
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      uploadHint.innerHTML = '<img src="' + escapeHtml(e.target.result) + '" alt="预览" /><br />' + escapeHtml(file.name);
    };
    reader.readAsDataURL(file);
  }

  // 拖拽支持
  function setupDragDrop() {
    if (!uploadBox) return;
    uploadBox.addEventListener("dragover", function (e) {
      e.preventDefault();
      uploadBox.classList.add("is-dragover");
    });
    uploadBox.addEventListener("dragleave", function () {
      uploadBox.classList.remove("is-dragover");
    });
    uploadBox.addEventListener("drop", function (e) {
      e.preventDefault();
      uploadBox.classList.remove("is-dragover");
      if (fileInput && e.dataTransfer && e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        handleFileChange();
      }
    });
  }

  // 渲染 9 个骨架卡片
  function renderSkeletonGrid() {
    if (!gridEl) return;
    gridEl.classList.remove("is-hidden");
    var html = "";
    for (var i = 1; i <= 9; i++) {
      html += '<article class="studio-card studio-card--loading">'
        + '<div class="studio-card__skeleton" aria-hidden="true"></div>'
        + '<div class="studio-card__body">'
        + '<div class="studio-card__label">变体 ' + i + '</div>'
        + '<p class="studio-card__prompt">生成中…</p>'
        + '</div></article>';
    }
    gridEl.innerHTML = html;
  }

  // 渲染单张成功卡片
  function renderCardSuccess(v) {
    var src = resolveUrl(v.image_url);
    return '<article class="studio-card">'
      + (src ? '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(v.dimension_label) + '" loading="lazy" />' : '<div class="studio-card__placeholder">无图像数据</div>')
      + '<div class="studio-card__body">'
      + '<div class="studio-card__label">' + escapeHtml(v.variant_id + ". " + v.dimension_label) + '</div>'
      + '<p class="studio-card__prompt">' + escapeHtml(v.prompt) + '</p>'
      + '</div></article>';
  }

  // 渲染单张失败卡片
  function renderCardError(v) {
    return '<article class="studio-card">'
      + '<div class="studio-card__error">'
      + '<span class="studio-card__error-title">生成失败</span>'
      + '<span>' + escapeHtml(v.error || "未知错误") + '</span>'
      + '</div>'
      + '<div class="studio-card__body">'
      + '<div class="studio-card__label">' + escapeHtml(v.variant_id + ". " + v.dimension_label) + '</div>'
      + '<p class="studio-card__prompt">' + escapeHtml(v.prompt) + '</p>'
      + '</div></article>';
  }

  // 渲染 9 张结果卡片
  function renderVariantCards(variants) {
    if (!gridEl) return;
    var html = "";
    for (var i = 0; i < variants.length; i++) {
      var v = variants[i];
      html += v.error ? renderCardError(v) : renderCardSuccess(v);
    }
    gridEl.innerHTML = html;
  }

  // 渲染九宫格预览 + 下载
  function renderGridPreview(data) {
    if (!resultEl) return;
    resultEl.classList.remove("is-hidden");
    var gridUrl = resolveUrl(data.grid_url);
    var successCount = 0;
    for (var i = 0; i < data.variants.length; i++) {
      if (!data.variants[i].error) successCount++;
    }
    resultEl.innerHTML =
      '<h3 class="studio-result__title">九宫格导演板</h3>'
      + '<p class="studio-result__key">一致性关键特征：<code>' + escapeHtml(data.consistency_key || "—") + '</code></p>'
      + '<img class="studio-result__img" src="' + escapeHtml(gridUrl) + '" alt="九宫格导演板" />'
      + '<div class="studio-result__actions">'
      + '<a class="btn btn--primary" href="' + escapeHtml(gridUrl) + '" download>下载九宫格</a>'
      + '<span class="studio-status" style="margin:0">成功 ' + successCount + '/9</span>'
      + '</div>';
  }

  // 表单提交
  function handleSubmit(e) {
    e.preventDefault();
    if (!form) return;
    var file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) {
      showStatus("请先上传参考图", true);
      return;
    }
    var subject = (document.getElementById("studioSubject") || {}).value || "";
    if (!subject.trim()) {
      showStatus("请填写创作主题", true);
      return;
    }

    var formData = new FormData(form);
    hideStatus();
    if (resultEl) resultEl.classList.add("is-hidden");
    renderSkeletonGrid();
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "生成中…"; }
    showStatus("正在生成 9 变体 prompt 并并发图生图，预计 1-3 分钟…", false);

    fetch(STUDIO_API, {
      method: "POST",
      body: formData
    }).then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function (t) {
          var msg = t;
          try { var j = JSON.parse(t); msg = j.detail || j.message || t; } catch (e) { /* keep raw */ }
          throw new Error("HTTP " + resp.status + (msg ? " - " + msg : ""));
        });
      }
      return resp.json();
    }).then(function (data) {
      if (data && data.status === "success" && data.grid_url) {
        renderVariantCards(data.variants || []);
        renderGridPreview(data);
        hideStatus();
      } else {
        showStatus((data && (data.detail || data.message)) || "后端未返回有效结果", true);
        if (gridEl) gridEl.innerHTML = "";
      }
    }).catch(function (err) {
      var msg = err && err.message ? err.message : String(err);
      if (/Failed to fetch/i.test(msg)) msg = "无法连接后端（" + BACKEND_URL + "），请确认服务已启动";
      showStatus("生成失败：" + msg, true);
      if (gridEl) gridEl.innerHTML = "";
    }).finally(function () {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "生成九宫格导演板"; }
    });
  }

  function init() {
    if (form) form.addEventListener("submit", handleSubmit);
    if (fileInput) fileInput.addEventListener("change", handleFileChange);
    setupDragDrop();
  }

  Q.imageStudio = {
    init: init,
    reset: function () {
      if (gridEl) gridEl.innerHTML = "";
      if (resultEl) resultEl.classList.add("is-hidden");
      hideStatus();
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window.Qinghe);
