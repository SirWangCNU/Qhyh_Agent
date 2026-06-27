/* ============================================================
   video-compose-ui.js · 一键成片 UI
   负责：调用 POST /api/video/mvp，把 workshop state 串联为
         分镜取图 → TTS → 视频合成，完成后在素材区渲染原生
         <video> 播放器与下载按钮。
   依赖：window.Qinghe.workshop.getState()（由 workshop.js 暴露）
   说明：workshop.js 已接近 500 行上限，故把成片 UI 拆到本文件，
        挂在 window.Qinghe.videoCompose 命名空间下。
   ============================================================ */

window.Qinghe = window.Qinghe || {};

(function (Q) {
  "use strict";

  // 与 workshop.js 一致的 BACKEND_URL 取法，避免跨文件隐式依赖
  var BACKEND_URL = ((window.__QINGHE_CONFIG__ && window.__QINGHE_CONFIG__.BACKEND_URL) || "http://localhost:18739").replace(/\/+$/, "");
  var VIDEO_MVP_API = BACKEND_URL + "/api/video/mvp";

  var composeBtn = document.getElementById("stepComposeVideo");
  var videoResult = document.getElementById("videoResult");
  var videoPreview = document.getElementById("videoPreview");

  // 进度文案序列：请求在途时按序推进，模拟分镜取图 → TTS → 合成
  var PROGRESS_STEPS = [
    "正在生成分镜图片…",
    "正在合成旁白语音…",
    "正在合成视频…"
  ];

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function getWorkshopState() {
    return (Q.workshop && Q.workshop.getState) ? Q.workshop.getState() : {};
  }

  // 是否存在可用的分镜 Prompt（视觉 Agent 已执行）
  function hasShotPrompts(state) {
    if (!state) return false;
    var visual = state.visual_output || {};
    var shots = visual.shot_prompts || state.shot_prompts || [];
    if (!Array.isArray(shots)) return false;
    return shots.some(function (s) { return s && s.prompt; });
  }

  // 相对 URL（/outputs/video/xxx.mp4）拼接为完整可访问地址
  function resolveUrl(url) {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    return BACKEND_URL + (url.charAt(0) === "/" ? "" : "/") + url;
  }

  function formatDuration(seconds) {
    if (seconds == null || isNaN(seconds)) return "—";
    var s = Math.round(Number(seconds));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m > 0 ? (m + "分" + r + "秒") : (r + "秒");
  }

  function showProgress(message) {
    if (!videoResult) return;
    videoResult.classList.remove("is-hidden");
    videoResult.innerHTML =
      '<div class="video-result__progress">'
      + '<span class="video-result__spinner" aria-hidden="true"></span>'
      + '<span>' + escapeHtml(message) + '</span>'
      + '</div>';
  }

  function showError(message) {
    if (!videoResult) return;
    videoResult.classList.remove("is-hidden");
    videoResult.innerHTML =
      '<div class="video-result__progress video-result__progress--error">'
      + '<span>一键成片失败</span>'
      + '<span>' + escapeHtml(message) + '</span>'
      + '</div>';
  }

  // 渲染最终视频：原生 <video> 播放器 + 元信息 + 下载按钮
  function renderVideo(data) {
    if (!videoResult) return;
    var videoUrl = resolveUrl(data.video_url);
    var audioUrl = resolveUrl(data.audio_url);
    videoResult.classList.remove("is-hidden");

    var playerHtml =
      '<div class="video-result__player">'
      + '<video controls preload="metadata" playsinline>'
      + '<source src="' + escapeHtml(videoUrl) + '" type="video/mp4" />'
      + '您的浏览器不支持 video 标签，请改用最新版 Chrome / Edge / Safari 打开。'
      + '</video>'
      + '</div>';

    var metaHtml =
      '<div class="video-result__meta">'
      + '<span>分镜图片：<strong>' + escapeHtml(data.image_count != null ? data.image_count : "—") + '</strong> 张</span>'
      + '<span>预计时长：<strong>' + escapeHtml(formatDuration(data.duration_estimate)) + '</strong></span>'
      + (data.task_id ? '<span>任务号：<code>' + escapeHtml(data.task_id) + '</code></span>' : '')
      + '</div>';

    var actionsHtml =
      '<div class="video-result__actions">'
      + '<a class="btn btn--primary" href="' + escapeHtml(videoUrl) + '" download>下载成片</a>'
      + (audioUrl ? '<a class="btn btn--ghost" href="' + escapeHtml(audioUrl) + '" download>下载旁白音频</a>' : '')
      + '</div>';

    videoResult.innerHTML =
      '<div class="video-result__inner">'
      + playerHtml + metaHtml + actionsHtml
      + '</div>';
  }

  function composeVideo() {
    var state = getWorkshopState();

    // 1. 前置检查：必须先执行视觉 Agent，产出 shot_prompts
    if (!hasShotPrompts(state)) {
      showError("请先执行「视觉 Agent」步骤生成分镜 Prompt，再一键成片。");
      var rail = document.getElementById("stepRail");
      if (rail) rail.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    // 2. 按钮状态：禁用 → "成片中…"
    if (composeBtn) { composeBtn.disabled = true; composeBtn.textContent = "成片中…"; }

    // 隐藏旧的 stub 预览，避免和真实成片混淆
    if (videoPreview) videoPreview.classList.add("is-hidden");

    // 3. 进度提示循环：每 1.6s 推进一条文案
    var stepIdx = 0;
    showProgress(PROGRESS_STEPS[stepIdx]);
    var timer = setInterval(function () {
      stepIdx = Math.min(stepIdx + 1, PROGRESS_STEPS.length - 1);
      showProgress(PROGRESS_STEPS[stepIdx]);
    }, 1600);

    // 4. 调用后端一键成片
    fetch(VIDEO_MVP_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: state })
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
      clearInterval(timer);
      // 5. 成功：渲染播放器；失败：显示错误
      if (data && data.status === "success" && data.video_url) {
        renderVideo(data);
      } else {
        showError((data && (data.message || data.detail)) || "后端未返回有效视频地址");
      }
    }).catch(function (err) {
      clearInterval(timer);
      var msg = err && err.message ? err.message : String(err);
      if (/Failed to fetch/i.test(msg)) msg = "无法连接后端（" + BACKEND_URL + "），请确认服务已启动";
      showError(msg);
    }).finally(function () {
      // 6. 恢复按钮
      if (composeBtn) { composeBtn.disabled = false; composeBtn.textContent = "一键成片"; }
    });
  }

  // 绑定事件
  if (composeBtn) composeBtn.addEventListener("click", composeVideo);

  // 暴露接口（便于外部触发或重置）
  Q.videoCompose = {
    compose: composeVideo,
    reset: function () {
      if (videoResult) {
        videoResult.classList.add("is-hidden");
        videoResult.innerHTML = "";
      }
    }
  };
})(window.Qinghe);
