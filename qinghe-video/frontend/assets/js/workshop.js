/* ============================================================
   workshop.js · 分步 Agent 工坊
   负责：步骤切换、单步执行、图片/视频素材生成展示
   ============================================================ */

window.Qinghe = window.Qinghe || {};

(function (Q) {
  "use strict";

  var BACKEND_URL = ((window.__QINGHE_CONFIG__ && window.__QINGHE_CONFIG__.BACKEND_URL) || "http://localhost:18739").replace(/\/+$/, "");
  var AGENT_API = BACKEND_URL + "/api/agents/";
  var IMAGE_API = BACKEND_URL + "/api/images/generate";
  var VIDEO_API = BACKEND_URL + "/api/videos/generate";

  var STEPS = [
    { key: "planner", num: "01", title: "策划 Agent", kicker: "Planner", desc: "先确定主题方向、核心卖点与目标受众。" },
    { key: "copywriter", num: "02", title: "文案 Agent", kicker: "Copywriter", desc: "撰写 Hook、口播正文与行动号召。" },
    { key: "scriptwriter", num: "03", title: "脚本 Agent", kicker: "Scriptwriter", desc: "把文案拆成可拍摄的分镜脚本与运镜。" },
    { key: "visual_designer", num: "04", title: "视觉 Agent", kicker: "Visual Designer", desc: "为每个镜头生成英文 AI 生图 / 生视频 Prompt。" },
    { key: "distributor", num: "05", title: "投放 Agent", kicker: "Distributor", desc: "制定标题、标签、发布时间与推广策略。" },
    { key: "report_generator", num: "06", title: "报告生成", kicker: "Report", desc: "把前五步汇总成一份完整 Markdown 方案。" }
  ];

  var rail = document.getElementById("stepRail");
  var runBtn = document.getElementById("runStepBtn");
  var stepOutput = document.getElementById("stepOutput");
  var activeNum = document.getElementById("activeStepNum");
  var activeKicker = document.getElementById("activeStepKicker");
  var activeTitle = document.getElementById("activeStepTitle");
  var activeDesc = document.getElementById("activeStepDesc");

  var imgBtn = document.getElementById("stepGenerateImages");
  var vidBtn = document.getElementById("stepGenerateVideo");
  var imgGallery = document.getElementById("stepImageGallery");
  var videoPreview = document.getElementById("videoPreview");

  // 工坊共享状态：保留每一步累计后的全局 state，供下一步与素材生成使用
  var workshopState = {};
  var userInput = null;
  var activeStep = "planner";
  var doneSteps = {};
  var lastError = null;

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function highlightJson(obj) {
    var json;
    try { json = JSON.stringify(obj, null, 2); }
    catch (e) { json = String(obj); }
    json = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return json.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      function (match) {
        var cls = "n";
        if (/^"/.test(match)) { cls = /:$/.test(match) ? "k" : "s"; }
        else if (/true|false/.test(match)) { cls = "b"; }
        else if (/null/.test(match)) { cls = "b"; }
        return '<span class="' + cls + '">' + match + "</span>";
      }
    );
  }

  function setOutput(text, kind) {
    if (!stepOutput) return;
    stepOutput.classList.remove("is-error", "is-loading");
    if (kind) stepOutput.classList.add(kind);
    stepOutput.innerHTML = text;
  }

  function setActiveStep(stepKey) {
    activeStep = stepKey;
    var meta = STEPS.filter(function (s) { return s.key === stepKey; })[0] || STEPS[0];
    if (activeNum) activeNum.textContent = meta.num;
    if (activeKicker) activeKicker.textContent = meta.kicker;
    if (activeTitle) activeTitle.textContent = meta.title;
    if (activeDesc) activeDesc.textContent = meta.desc;

    if (rail) {
      rail.querySelectorAll(".step-card").forEach(function (card) {
        card.classList.toggle("is-active", card.getAttribute("data-step") === stepKey);
      });
    }
  }

  function refreshRailStatus() {
    if (!rail) return;
    rail.querySelectorAll(".step-card").forEach(function (card) {
      var key = card.getAttribute("data-step");
      card.classList.toggle("is-done", !!doneSteps[key]);
      card.classList.toggle("is-error", lastError && lastError.step === key);
    });
  }

  function readFormInput() {
    var get = function (id) {
      var el = document.getElementById(id);
      return el ? (el.value || "").trim() : "";
    };
    return {
      product_name: get("product_name"),
      origin: get("origin"),
      category: get("category"),
      selling_points: get("selling_points"),
      target_platform: get("target_platform") || "抖音",
      target_duration: get("target_duration") || "30-60秒",
      additional_info: get("additional_info") || ""
    };
  }

  function validateInput() {
    var v = readFormInput();
    if (!v.product_name || !v.origin || !v.category || !v.selling_points) {
      return { ok: false, message: "请先在上方表单填写产品名称、产地、品类与卖点", data: v };
    }
    return { ok: true, data: v };
  }

  function runStep() {
    var v = validateInput();
    if (!v.ok) {
      setOutput('<span style="color:#e0a96d">' + escapeHtml(v.message) + "</span>", "is-error");
      var el = document.getElementById("product_name");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    userInput = v.data;

    setOutput('<span style="color:#8fb3d1">⏳ 正在执行 ' + escapeHtml(activeStep) + '…</span>', "is-loading");
    if (runBtn) { runBtn.disabled = true; runBtn.textContent = "执行中…"; }

    var payload = { input: userInput, state: workshopState };

    fetch(AGENT_API + activeStep, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function (t) {
          throw new Error("HTTP " + resp.status + (t ? " - " + t : ""));
        });
      }
      return resp.json();
    }).then(function (data) {
      if (data.state) workshopState = data.state;
      if (data.status === "success") {
        doneSteps[activeStep] = true;
        lastError = null;
        // Task 4：按 Agent 字段结构化渲染，替代把 JSON 塞进 <pre>
        var renderer = Q.agentRender && Q.agentRender.renderAgentOutput;
        setOutput(renderer ? renderer(activeStep, data.output) : highlightJson(data.output), "");
      } else {
        lastError = { step: activeStep, error: data.error };
        setOutput(
          '<span style="color:#e0a96d">执行出错：</span>\n\n' + escapeHtml(data.error || "未知错误"),
          "is-error"
        );
      }
      refreshRailStatus();
    }).catch(function (err) {
      var msg = err && err.message ? err.message : String(err);
      if (/Failed to fetch/i.test(msg)) msg = "无法连接后端（" + BACKEND_URL + "），请确认服务已启动";
      setOutput('<span style="color:#e0a96d">请求失败：</span> ' + escapeHtml(msg), "is-error");
    }).finally(function () {
      if (runBtn) { runBtn.disabled = false; runBtn.textContent = "执行当前步骤"; }
    });
  }

  function defaultShotPrompts() {
    if (!userInput) return [];
    var p = userInput;
    return [
      {
        shot_id: 1,
        prompt: "Cinematic close-up of " + (p.product_name || "agricultural product") + " from " + (p.origin || "farm") + ", fresh harvest, golden hour, shallow depth of field, hyper-realistic photography, soft natural light",
        negative_prompt: "low quality, blurry, watermark, text"
      },
      {
        shot_id: 2,
        prompt: "Hands carefully picking " + (p.product_name || "fresh produce") + " in " + (p.origin || "the orchard") + ", dewdrops, lush green leaves, agricultural lifestyle, 35mm film grain, warm tones",
        negative_prompt: "low quality, blurry, watermark, text"
      },
      {
        shot_id: 3,
        prompt: "Macro shot of " + (p.product_name || "fresh produce") + " texture and freshness, water droplets, food photography, soft studio light, top-down composition",
        negative_prompt: "low quality, blurry, watermark, text"
      },
      {
        shot_id: 4,
        prompt: "Origin landscape of " + (p.origin || "Chinese countryside") + " at sunrise, misty mountains, terraced fields, agricultural product " + (p.product_name || "fresh produce") + " on wooden table, cinematic wide shot",
        negative_prompt: "low quality, blurry, watermark, text"
      }
    ];
  }

  function getShotPrompts() {
    var visual = (workshopState.visual_output) || {};
    var prompts = visual.shot_prompts || [];
    var valid = prompts.filter(function (p) { return p && p.prompt; }).slice(0, 4);
    if (valid.length) return valid;
    return defaultShotPrompts();
  }

  function getShotPromptSource() {
    var visual = (workshopState.visual_output) || {};
    var prompts = visual.shot_prompts || [];
    return prompts.filter(function (p) { return p && p.prompt; }).slice(0, 4).length > 0
      ? "visual_agent"
      : "default";
  }

  // Task 5：图片生成状态。currentImagePrompts 保存当前批次的 prompts，
  // 供「重生 / 重试」按钮按 index 取回对应 prompt；imageGenRemaining 用于主按钮恢复。
  var currentImagePrompts = [];
  var imageGenRemaining = 0;

  function imageCardId(index) { return "image-card-" + index; }

  // 骨架屏卡片：灰色脉冲占位，请求完成后由 updateCard* 替换
  function renderSkeletonCard(index, promptItem) {
    return (
      '<article class="image-card image-card--loading" id="' + imageCardId(index) + '" data-index="' + index + '">'
      + '<div class="image-card__skeleton" aria-hidden="true"></div>'
      + '<div class="image-card__body">'
      + '<div class="image-card__title">镜头 ' + escapeHtml(promptItem.shot_id || "—") + '</div>'
      + '<p class="image-card__prompt">' + escapeHtml(promptItem.prompt) + '</p>'
      + '</div></article>'
    );
  }

  function renderImageCardSuccess(index, promptItem, image) {
    var url = image && image.url;
    var b64 = image && image.b64_json;
    var src = url || (b64 ? "data:image/png;base64," + b64 : "");
    return (
      '<article class="image-card" id="' + imageCardId(index) + '" data-index="' + index + '">'
      + '<button type="button" class="image-card__regen" data-index="' + index + '" title="重生此张">↻ 重生</button>'
      + (src ? '<img src="' + escapeHtml(src) + '" alt="镜头 ' + escapeHtml(promptItem.shot_id) + '" loading="lazy" />' : '<div class="image-card__placeholder">无图像数据</div>')
      + '<div class="image-card__body">'
      + '<div class="image-card__title">镜头 ' + escapeHtml(promptItem.shot_id || "—") + '</div>'
      + '<p class="image-card__prompt">' + escapeHtml(promptItem.prompt) + '</p>'
      + (url ? '<a class="image-card__link" href="' + escapeHtml(url) + '" target="_blank" rel="noopener">打开原图</a>' : '')
      + '</div></article>'
    );
  }

  function renderImageCardError(index, promptItem, errMsg) {
    return (
      '<article class="image-card image-card--error" id="' + imageCardId(index) + '" data-index="' + index + '">'
      + '<div class="image-card__error">'
      + '<span class="image-card__error-title">生成失败</span>'
      + '<p class="image-card__errmsg">' + escapeHtml(errMsg || "未知错误") + '</p>'
      + '<button type="button" class="image-card__retry" data-index="' + index + '">重试</button>'
      + '</div>'
      + '<div class="image-card__body">'
      + '<div class="image-card__title">镜头 ' + escapeHtml(promptItem.shot_id || "—") + '</div>'
      + '<p class="image-card__prompt">' + escapeHtml(promptItem.prompt) + '</p>'
      + '</div></article>'
    );
  }

  function updateCard(index, html) {
    var node = document.getElementById(imageCardId(index));
    if (node && node.parentNode) {
      var tmp = document.createElement("div");
      tmp.innerHTML = html;
      var next = tmp.firstChild;
      if (next) node.parentNode.replaceChild(next, node);
    }
  }

  function updateCardToLoading(index, promptItem) {
    updateCard(index, renderSkeletonCard(index, promptItem));
  }

  function updateCardToSuccess(index, promptItem, image) {
    updateCard(index, renderImageCardSuccess(index, promptItem, image));
  }

  function updateCardToError(index, promptItem, errMsg) {
    updateCard(index, renderImageCardError(index, promptItem, errMsg));
  }

  // 单张图片请求；成功/失败各自更新对应卡片。trackProgress=false 时不影响主按钮（用于重生/重试）。
  function fetchSingleImage(index, promptItem, trackProgress) {
    updateCardToLoading(index, promptItem);
    fetch(IMAGE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: promptItem.prompt,
        negative_prompt: promptItem.negative_prompt || "",
        size: "1920x1920",
        n: 1
      })
    }).then(function (resp) {
      if (!resp.ok) return resp.text().then(function (t) { throw new Error(t || ("HTTP " + resp.status)); });
      return resp.json();
    }).then(function (data) {
      var image = data.images && data.images[0];
      if (!image) throw new Error("后端未返回图像数据");
      updateCardToSuccess(index, promptItem, image);
    }).catch(function (err) {
      updateCardToError(index, promptItem, err && err.message ? err.message : String(err));
    }).finally(function () {
      if (trackProgress) {
        imageGenRemaining = Math.max(0, imageGenRemaining - 1);
        if (imageGenRemaining === 0 && imgBtn) {
          imgBtn.disabled = false;
          imgBtn.textContent = "生成图片素材";
        }
      }
    });
  }

  // 单张重生 / 失败重试：按 index 取回当前批次的 prompt，独立请求，不影响主按钮状态
  function regenerateSingleImage(index, promptItem) {
    fetchSingleImage(index, promptItem, false);
  }

  function generateImages() {
    if (!userInput) {
      if (imgGallery) {
        imgGallery.classList.remove("is-hidden");
        imgGallery.innerHTML = '<p style="color:#b85c38;font-weight:600">⚠️ 请先在顶部表单填写产品信息，然后点击「执行当前步骤」至少一步，素材区即可生成图片。</p>';
      }
      var el = document.getElementById("product_name");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    var prompts = getShotPrompts();
    var source = getShotPromptSource();

    if (!prompts.length) {
      if (imgGallery) {
        imgGallery.classList.remove("is-hidden");
        imgGallery.innerHTML = '<p style="color:var(--color-warn)">没有可用的分镜 Prompt，请先执行「视觉 Agent」。</p>';
      }
      return;
    }

    currentImagePrompts = prompts.slice();
    imageGenRemaining = prompts.length;

    if (imgGallery) {
      imgGallery.classList.remove("is-hidden");
      var sourceLabel = source === "visual_agent"
        ? '<span style="color:var(--color-accent)">使用视觉 Agent 输出的分镜 Prompt</span>'
        : '<span style="color:var(--color-ink-soft)">使用默认模板分镜（未执行视觉 Agent）</span>';
      var hint = '<p class="image-gallery__hint">' + sourceLabel + ' · 正在逐张调用 seedream 生成图片素材，请稍候…</p>';
      // 先渲染 N 张骨架卡片，再逐张独立请求
      var cards = prompts.map(function (item, i) { return renderSkeletonCard(i, item); }).join("");
      imgGallery.innerHTML = hint + cards;
    }
    if (imgBtn) { imgBtn.disabled = true; imgBtn.textContent = "生成中…"; }

    // 逐张独立请求：互不阻塞，单张失败不影响其它
    prompts.forEach(function (item, i) {
      fetchSingleImage(i, item, true);
    });
  }

  function generateVideoPreview() {
    var prompts = getShotPrompts();
    var first = prompts[0];
    var promptText = first ? first.prompt : "agricultural product cinematic shot, golden hour, realistic";
    var body = {
      prompt: promptText,
      duration_seconds: 5,
      size: "1280x720"
    };

    if (vidBtn) { vidBtn.disabled = true; vidBtn.textContent = "生成中…"; }

    fetch(VIDEO_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (resp) {
      if (!resp.ok) return resp.text().then(function (t) { throw new Error(t || ("HTTP " + resp.status)); });
      return resp.json();
    }).then(function (data) {
      if (videoPreview) {
        videoPreview.classList.remove("is-hidden");
        videoPreview.innerHTML =
          '<div class="video-preview__frame"><div class="video-preview__play">▶</div></div>'
          + '<div class="video-preview__body">'
          + '<h4>视频生成预览</h4>'
          + '<p>' + escapeHtml(data.message || "视频生成接口已预留，待接入后返回真实视频。") + '</p>'
          + '<div class="video-preview__meta">'
          + '<span>model: ' + escapeHtml(data.model || "—") + '</span>'
          + '<span>size: ' + escapeHtml(data.size || "—") + '</span>'
          + '<span>duration: ' + escapeHtml(data.duration_seconds || "—") + 's</span>'
          + '<span>status: ' + escapeHtml(data.status || "preview") + '</span>'
          + '</div></div>';
      }
    }).catch(function (err) {
      if (videoPreview) {
        videoPreview.classList.remove("is-hidden");
        videoPreview.innerHTML = '<div class="video-preview__body"><p style="color:var(--color-warn)">视频预览失败：' + escapeHtml(err.message || err) + '</p></div>';
      }
    }).finally(function () {
      if (vidBtn) { vidBtn.disabled = false; vidBtn.textContent = "生成视频展示"; }
    });
  }

  // 绑定事件
  if (rail) {
    rail.addEventListener("click", function (e) {
      var card = e.target.closest(".step-card");
      if (!card) return;
      setActiveStep(card.getAttribute("data-step"));
    });
  }
  if (runBtn) runBtn.addEventListener("click", runStep);
  if (imgBtn) imgBtn.addEventListener("click", generateImages);
  if (vidBtn) vidBtn.addEventListener("click", generateVideoPreview);

  // Task 5：图片卡片「重生 / 重试」按钮事件委托
  if (imgGallery) {
    imgGallery.addEventListener("click", function (e) {
      var btn = e.target.closest(".image-card__regen, .image-card__retry");
      if (!btn) return;
      var idx = parseInt(btn.getAttribute("data-index"), 10);
      if (isNaN(idx)) return;
      var item = currentImagePrompts[idx];
      if (item) regenerateSingleImage(idx, item);
    });
  }

  // 暴露接口（供主逻辑联动）
  Q.workshop = {
    setActiveStep: setActiveStep,
    getState: function () { return workshopState; },
    reset: function () {
      workshopState = {};
      doneSteps = {};
      lastError = null;
      refreshRailStatus();
      setOutput("等待执行 · 当前步骤产物会显示在这里");
      if (imgGallery) imgGallery.classList.add("is-hidden");
      if (videoPreview) videoPreview.classList.add("is-hidden");
    }
  };
})(window.Qinghe);
