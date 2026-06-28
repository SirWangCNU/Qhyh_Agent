/* ============================================================
   chat.js · 对话创作页
   ChatGPT 风格交互：多轮对话 → 顺序调用 Agent → 一键成片
   依赖：agent-renderers.js（Q.agentRender）、workshop.js（可选）
   暴露：window.Qinghe.chat
   ============================================================ */

window.Qinghe = window.Qinghe || {};

(function (Q) {
  "use strict";

  var BACKEND_URL = ((window.__QINGHE_CONFIG__ && window.__QINGHE_CONFIG__.BACKEND_URL) || "http://localhost:18739").replace(/\/+$/, "");
  var AGENT_API = BACKEND_URL + "/api/agents/";
  var VIDEO_MVP_API = BACKEND_URL + "/api/video/mvp";
  var STORAGE_KEY = "qinghe_plans";
  var STEPS = ["planner", "copywriter", "scriptwriter", "visual_designer", "distributor"];
  var QUICK_PROMPTS = [
    "为阳山水蜜桃生成 30 秒抖音视频",
    "为五常大米写一条 60 秒快手口播脚本",
    "为西湖龙井策划一个产地溯源短视频",
    "为赣南脐橙生成适合视频号的投放方案"
  ];

  var messagesEl = document.getElementById("chatMessages");
  var showcaseEl = document.getElementById("chatShowcase");
  var inputEl = document.getElementById("chatInput");
  var sendBtn = document.getElementById("chatSendBtn");

  var chatHistory = [];
  var workshopState = {};
  var doneSteps = {};
  var isRunning = false;
  var currentPlanId = null;
  var loadingId = null;
  var lastUserInput = {};

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------- localStorage 计划读写 ----------
  function loadPlans() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch (e) { return {}; }
  }

  function savePlans(plans) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(plans)); }
    catch (e) { console.warn("[chat] 无法保存计划", e); }
  }

  function getPlan(planId) {
    return loadPlans()[planId] || null;
  }

  function updateUrlPlanId(planId) {
    var hash = window.location.hash || "#/chat";
    var base = hash.split("?")[0];
    window.location.replace(window.location.pathname + window.location.search + base + "?planId=" + encodeURIComponent(planId));
  }

  function getUrlPlanId() {
    var hash = window.location.hash || "";
    var m = hash.match(/[?&]planId=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // ---------- 用户输入解析 ----------
  function parseUserInput(text) {
    text = (text || "").trim();
    if (!text) return null;

    // 尝试按 JSON 解析
    try {
      var j = JSON.parse(text);
      if (j && typeof j === "object") {
        return {
          product_name: j.product_name || j.product || "农产品",
          origin: j.origin || "中国",
          category: j.category || "农产品",
          selling_points: j.selling_points || j.sellingpoints || "",
          target_platform: j.target_platform || j.platform || "抖音",
          target_duration: j.target_duration || j.duration || "30-60秒",
          additional_info: j.additional_info || j.additional || ""
        };
      }
    } catch (_) { /* 继续按自然语言解析 */ }

    var platform = "抖音";
    var duration = "30-60秒";
    var product = "";

    var platformMatch = text.match(/(抖音|快手|视频号|B站|小红书|淘宝)/);
    if (platformMatch) platform = platformMatch[1];

    var durationMatch = text.match(/(\d+)\s*[秒s]/);
    if (durationMatch) {
      var s = parseInt(durationMatch[1], 10);
      if (s <= 30) duration = "15-30秒";
      else if (s <= 60) duration = "30-60秒";
      else if (s <= 90) duration = "60-90秒";
      else duration = "90秒以上";
    }

    var forMatch = text.match(/为(.+?)(生成|写|策划|制作|创作)/);
    if (forMatch) {
      product = forMatch[1].replace(/[一-十\d]+\s*[秒s].*$/, "").trim();
    } else {
      product = text.split(/，|,|；|;/)[0].trim();
    }

    return {
      product_name: product || "农产品",
      origin: "中国",
      category: "农产品",
      selling_points: text,
      target_platform: platform,
      target_duration: duration,
      additional_info: ""
    };
  }

  // ---------- 渲染 ----------
  function setEmptyState(empty) {
    var page = document.querySelector(".chat-page");
    if (!page) return;
    if (empty) page.classList.add("is-empty");
    else page.classList.remove("is-empty");
  }

  function renderMessages() {
    if (!messagesEl) return;
    if (!chatHistory.length) {
      setEmptyState(true);
      renderWelcome();
      return;
    }

    setEmptyState(false);

    var html = '<div class="chat-toolbar"><button type="button" id="chatResetBtn">新对话</button></div>';
    chatHistory.forEach(function (msg, idx) {
      html += renderMessage(msg, idx);
    });
    messagesEl.innerHTML = html;
    bindToolbar();
    scrollToBottom();
  }

  function renderMessage(msg, idx) {
    if (msg.type === "loading") {
      return '<div class="chat-bubble chat-bubble--loading" data-idx="' + idx + '"><span class="spinner"></span>正在思考…</div>';
    }
    if (msg.type === "compose") {
      return '<div class="chat-compose" data-idx="' + idx + '"><button type="button" class="btn btn--primary" id="chatComposeBtn">' + escapeHtml(msg.content) + '</button></div>';
    }
    if (msg.type === "video") {
      return '<div class="chat-video-result" data-idx="' + idx + '">' + msg.content + '</div>';
    }

    var isUser = msg.role === "user";
    var cls = isUser ? "chat-bubble--user" : "chat-bubble--assistant";
    var label = isUser ? "你" : (msg.meta && msg.meta.step ? stepLabel(msg.meta.step) : "青禾");
    var avatar = isUser
      ? '<svg viewBox="0 0 16 16" fill="none"><path d="M8 8C10.2091 8 12 6.20914 12 4C12 1.79086 10.2091 0 8 0C5.79086 0 4 1.79086 4 4C4 6.20914 5.79086 8 8 8Z" fill="currentColor"/><path d="M0 15C0 11.6863 2.68629 9 6 9H10C13.3137 9 16 11.6863 16 15V16H0V15Z" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 32 32" fill="none"><path d="M16 4C16 4 8 8 8 16C8 20 11 24 16 24C21 24 24 20 24 16C24 8 16 4 16 4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M16 24V28M12 14L16 18L20 14M12 18L16 22L20 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    var body = "";
    if (msg.type === "agent" && msg.meta && msg.meta.step) {
      var renderer = Q.agentRender && Q.agentRender.renderAgentOutput;
      body = renderer ? renderer(msg.meta.step, msg.content) : '<pre class="agent-output__fallback">' + escapeHtml(JSON.stringify(msg.content, null, 2)) + '</pre>';
    } else {
      body = '<div class="chat-bubble__text">' + escapeHtml(msg.content) + '</div>';
    }

    return (
      '<div class="chat-bubble ' + cls + '" data-idx="' + idx + '">'
      + '<div class="chat-bubble__meta">'
      + '<span class="chat-bubble__avatar">' + avatar + '</span>'
      + '<span>' + escapeHtml(label) + '</span>'
      + '</div>'
      + body
      + '</div>'
    );
  }

  function stepLabel(step) {
    var map = { planner: "策划", copywriter: "文案", scriptwriter: "脚本", visual_designer: "视觉", distributor: "投放" };
    return map[step] || step;
  }

  function getGreetingName() {
    try {
      var user = Q.auth && Q.auth.getUser ? Q.auth.getUser() : null;
      if (user && user.username) return user.username;
    } catch (e) { /* ignore */ }
    return "创作者";
  }

  function renderWelcome() {
    if (!messagesEl) return;
    setEmptyState(true);
    var chips = QUICK_PROMPTS.map(function (p) {
      return '<button type="button" class="quick-chip" data-prompt="' + escapeHtml(p) + '"><svg viewBox="0 0 16 16" fill="none"><path d="M8 2L10 6L14 7L11 10L12 14L8 12L4 14L5 10L2 7L6 6L8 2Z" fill="currentColor"/></svg>' + escapeHtml(p) + '</button>';
    }).join("");

    var name = escapeHtml(getGreetingName());
    messagesEl.innerHTML =
      '<div class="chat-welcome">'
      + '<div class="chat-welcome__greeting">Hi <span>' + name + '</span>，和青禾一起聊聊创作想法<small>用自然语言描述需求，AI Agent 会依次完成策划、文案、脚本、视觉与投放。</small></div>'
      + '<div class="chat-welcome__chips">' + chips + '</div>'
      + '</div>';
    bindChips();
    renderChatShowcase();
  }

  var IMAGE_API = "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image";
  var SHOWCASE_WORKS = [
    {
      title: "安岳柠檬 · 产地溯源",
      desc: "30 秒抖音短视频，突出黄金产区与手工采摘。",
      platform: "抖音",
      duration: "30s",
      prompt: "cinematic close-up of fresh yellow lemons on a wooden basket in a sunlit citrus orchard, warm morning light, shallow depth of field, realistic photography, no text"
    },
    {
      title: "五常大米 · 品牌故事",
      desc: "60 秒快手口播脚本，讲述黑土种植到餐桌的旅程。",
      platform: "快手",
      duration: "60s",
      prompt: "aerial view of golden rice paddies in Northeast China, a farmer walking through the field with a straw hat, soft sunset light, cinematic realistic photography, no text"
    },
    {
      title: "西湖龙井 · 春茶上市",
      desc: "45 秒视频号产地溯源，展现清明前采茶与炒制。",
      platform: "视频号",
      duration: "45s",
      prompt: "close-up of fresh green tea leaves being picked by hand in a misty Longjing tea garden, spring morning dew, realistic photography, no text"
    },
    {
      title: "赣南脐橙 · 果园直发",
      desc: "30 秒抖音带货脚本，强调现摘现发与甜度保证。",
      platform: "抖音",
      duration: "30s",
      prompt: "ripe orange fruits hanging on trees in an orchard, farmer carrying a basket, golden hour sunlight, realistic photography, no text"
    },
    {
      title: "阳澄湖大闸蟹 · 金秋尝鲜",
      desc: "45 秒抖音短视频，聚焦蟹肥膏满与生态养殖。",
      platform: "抖音",
      duration: "45s",
      prompt: "fresh hairy crabs on a wooden tray with steam, golden autumn light, shallow depth of field, realistic food photography, no text"
    },
    {
      title: "新疆哈密瓜 · 沙漠绿洲",
      desc: "30 秒快手产地直发，突出昼夜温差与甘甜多汁。",
      platform: "快手",
      duration: "30s",
      prompt: "sweet melons in a desert oasis farm, farmer cutting a ripe melon, warm sunlight, realistic photography, no text"
    },
    {
      title: "云南普洱 · 古树茶韵",
      desc: "60 秒视频号品牌故事，呈现古茶树与手工制茶。",
      platform: "视频号",
      duration: "60s",
      prompt: "ancient tea trees in Yunnan misty mountains, hands rolling tea leaves traditionally, cinematic realistic photography, no text"
    },
    {
      title: "东北黑木耳 · 山林珍味",
      desc: "30 秒抖音带货脚本，强调椴木生长与原生态品质。",
      platform: "抖音",
      duration: "30s",
      prompt: "black wood ear mushrooms growing on logs in a Northeast China forest, soft natural light, realistic photography, no text"
    },
    {
      title: "海南芒果 · 热带阳光",
      desc: "45 秒快手短视频，展现热带果园与现摘现发。",
      platform: "快手",
      duration: "45s",
      prompt: "ripe mangoes hanging on tropical trees, farmer picking mangoes in a sunny Hainan orchard, realistic photography, no text"
    }
  ];

  function showcaseImgUrl(prompt) {
    return IMAGE_API + "?prompt=" + encodeURIComponent(prompt) + "&image_size=landscape_16_9";
  }

  function renderShowcaseCard(w, idx) {
    return (
      '<article class="chat-showcase__card" data-index="' + idx + '">'
      + '<div class="chat-showcase__media">'
      + '<img src="' + showcaseImgUrl(w.prompt) + '" alt="' + escapeAttr(w.title) + '" loading="lazy" />'
      + '<div class="chat-showcase__overlay">'
      + '<div class="chat-showcase__play"><svg viewBox="0 0 16 16" fill="none"><path d="M4 3L13 8L4 13V3Z" fill="currentColor"/></svg></div>'
      + '<h3 class="chat-showcase__name">' + escapeHtml(w.title) + '</h3>'
      + '<div class="chat-showcase__meta">'
      + '<span class="chat-showcase__tag">' + escapeHtml(w.platform) + '</span>'
      + '<span class="chat-showcase__tag">' + escapeHtml(w.duration) + '</span>'
      + '</div>'
      + '</div>'
      + '</div>'
      + '<div class="chat-showcase__info">'
      + '<p class="chat-showcase__desc">' + escapeHtml(w.desc) + '</p>'
      + '</div>'
      + '</article>'
    );
  }

  function renderShowcase(containerEl, onClick, showHeader) {
    if (!containerEl) return;

    var html = "";
    if (showHeader !== false) {
      html +=
        '<div class="chat-showcase__head">'
        + '<h3 class="chat-showcase__title">精选作品</h3>'
        + '<a href="#/plan" class="chat-showcase__more">查看全部 →</a>'
        + '</div>';
    }
    html +=
      '<div class="chat-showcase__grid">'
      + SHOWCASE_WORKS.map(function (w, i) { return renderShowcaseCard(w, i); }).join("")
      + '</div>';

    containerEl.innerHTML = html;

    containerEl.querySelectorAll(".chat-showcase__card").forEach(function (c) {
      c.addEventListener("click", function () {
        var idx = parseInt(c.getAttribute("data-index"), 10);
        var w = SHOWCASE_WORKS[idx];
        if (onClick && w) onClick(w, idx);
      });
    });
  }

  function renderChatShowcase() {
    renderShowcase(showcaseEl, function (w) {
      if (inputEl) {
        inputEl.value = "参考「" + w.title + "」的风格，" + w.desc;
        if (inputEl.focus) inputEl.focus();
      }
    });
  }

  function renderCreateShowcase() {
    var el = document.getElementById("createShowcase");
    if (!el) return;
    renderShowcase(el, function (w) {
      if (Q.router && typeof Q.router.navigate === "function") {
        Q.router.navigate("#/chat");
      } else {
        window.location.hash = "#/chat";
      }
      setTimeout(function () {
        if (inputEl) {
          inputEl.value = "参考「" + w.title + "」的风格，" + w.desc;
          if (inputEl.focus) inputEl.focus();
        }
      }, 120);
    }, false);
  }

  function bindChips() {
    if (!messagesEl) return;
    messagesEl.querySelectorAll(".quick-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var prompt = chip.getAttribute("data-prompt");
        if (inputEl) inputEl.value = prompt;
        submit(prompt);
      });
    });
  }

  function bindToolbar() {
    var resetBtn = document.getElementById("chatResetBtn");
    if (resetBtn) resetBtn.addEventListener("click", reset);
    var composeBtn = document.getElementById("chatComposeBtn");
    if (composeBtn) composeBtn.addEventListener("click", composeVideo);
  }

  function scrollToBottom() {
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ---------- 消息操作 ----------
  function appendMessage(role, type, content, meta) {
    chatHistory.push({ role: role, type: type, content: content, meta: meta || {} });
    renderMessages();
  }

  function setLoading(show) {
    if (show) {
      if (loadingId != null) return;
      loadingId = chatHistory.length;
      chatHistory.push({ role: "assistant", type: "loading", content: "", meta: {} });
      renderMessages();
    } else {
      if (loadingId == null) return;
      chatHistory = chatHistory.filter(function (_, i) { return i !== loadingId; });
      loadingId = null;
      renderMessages();
    }
  }

  // ---------- Agent 调用 ----------
  function callAgent(step, userInput) {
    return fetch(AGENT_API + step, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: userInput, state: workshopState })
    }).then(function (resp) {
      if (!resp.ok) return resp.text().then(function (t) { throw new Error("HTTP " + resp.status + (t ? " - " + t : "")); });
      return resp.json();
    });
  }

  function runAgentsSequentially(userInput) {
    isRunning = true;
    lastUserInput = userInput || {};
    setLoading(true);
    if (sendBtn) sendBtn.disabled = true;

    var idx = 0;
    function next() {
      if (idx >= STEPS.length) {
        setLoading(false);
        appendMessage("assistant", "compose", "一键成片", {});
        isRunning = false;
        if (sendBtn) sendBtn.disabled = false;
        savePlan();
        return;
      }
      var step = STEPS[idx++];
      appendMessage("assistant", "text", "正在执行「" + stepLabel(step) + "」…", { step: step });
      scrollToBottom();

      callAgent(step, userInput).then(function (data) {
        if (data.state) workshopState = data.state;
        if (data.status === "success") {
          doneSteps[step] = true;
          appendMessage("assistant", "agent", data.output, { step: step });
          scrollToBottom();
          next();
        } else {
          throw new Error(data.error || "未知错误");
        }
      }).catch(function (err) {
        setLoading(false);
        var msg = err && err.message ? err.message : String(err);
        if (/Failed to fetch/i.test(msg)) msg = "无法连接后端（" + BACKEND_URL + "），请确认服务已启动";
        appendMessage("assistant", "text", "「" + stepLabel(step) + "」执行失败：" + msg, { step: step, error: true });
        isRunning = false;
        if (sendBtn) sendBtn.disabled = false;
        savePlan();
      });
    }

    next();
  }

  // ---------- 一键成片 ----------
  function hasShotPrompts() {
    var visual = workshopState.visual_output || {};
    var shots = visual.shot_prompts || [];
    return Array.isArray(shots) && shots.some(function (s) { return s && s.prompt; });
  }

  function resolveUrl(url) {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    return BACKEND_URL + (url.charAt(0) === "/" ? "" : "/") + url;
  }

  function escapeAttr(s) { return escapeHtml(s).replace(/'/g, "&#39;"); }

  function composeVideo() {
    if (!hasShotPrompts()) {
      appendMessage("assistant", "text", "一键成片需要「视觉 Agent」的分镜 Prompt，请先完成完整对话流程。", {});
      return;
    }

    appendMessage("assistant", "text", "正在生成视频成片，请稍候…", {});
    if (sendBtn) sendBtn.disabled = true;
    scrollToBottom();

    fetch(VIDEO_MVP_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: lastUserInput, state: workshopState })
    }).then(function (resp) {
      if (!resp.ok) return resp.text().then(function (t) { throw new Error("HTTP " + resp.status + (t ? " - " + t : "")); });
      return resp.json();
    }).then(function (data) {
      if (data && data.status === "success" && data.video_url) {
        var videoUrl = resolveUrl(data.video_url);
        var html =
          '<div class="video-result__inner">'
          + '<div class="video-result__player"><video controls preload="metadata" playsinline><source src="' + escapeAttr(videoUrl) + '" type="video/mp4" /></video></div>'
          + '<div class="video-result__actions"><a class="btn btn--primary" href="' + escapeAttr(videoUrl) + '" download>下载成片</a></div>'
          + '</div>';
        appendMessage("assistant", "video", html, {});
      } else {
        appendMessage("assistant", "text", "一键成片失败：" + (data && (data.message || data.detail || data.error)) || "后端未返回有效视频地址", {});
      }
    }).catch(function (err) {
      var msg = err && err.message ? err.message : String(err);
      if (/Failed to fetch/i.test(msg)) msg = "无法连接后端（" + BACKEND_URL + "），请确认服务已启动";
      appendMessage("assistant", "text", "一键成片失败：" + msg, {});
    }).finally(function () {
      if (sendBtn) sendBtn.disabled = false;
      savePlan();
    });
  }

  // ---------- 提交 ----------
  function submit(text) {
    text = (text || "").trim();
    if (!text || isRunning) return;

    var userInput = parseUserInput(text);
    appendMessage("user", "text", text, {});
    runAgentsSequentially(userInput);
  }

  function onSend() {
    if (!inputEl) return;
    var text = inputEl.value;
    inputEl.value = "";
    submit(text);
  }

  // ---------- 公开 API ----------
  function reset() {
    chatHistory = [];
    workshopState = {};
    doneSteps = {};
    isRunning = false;
    loadingId = null;
    currentPlanId = null;
    renderWelcome();
    var base = (window.location.hash || "#/chat").split("?")[0];
    window.location.hash = base;
    if (inputEl) inputEl.value = "";
    if (sendBtn) sendBtn.disabled = false;
  }

  function savePlan() {
    if (!chatHistory.length) return;
    if (!currentPlanId) currentPlanId = "plan_" + Date.now();

    // 从历史中提取标题（第一条用户消息）
    var title = "";
    for (var i = 0; i < chatHistory.length; i++) {
      if (chatHistory[i].role === "user" && chatHistory[i].type === "text") {
        title = (chatHistory[i].content || "").slice(0, 40);
        break;
      }
    }
    if (!title && lastUserInput.product_name) title = lastUserInput.product_name;

    // 最后一条非 loading 消息
    var lastMessage = "";
    for (var j = chatHistory.length - 1; j >= 0; j--) {
      if (chatHistory[j].type !== "loading") {
        lastMessage = typeof chatHistory[j].content === "string" ? chatHistory[j].content : "";
        break;
      }
    }

    var plans = loadPlans();
    plans[currentPlanId] = {
      id: currentPlanId,
      title: title || "未命名方案",
      progress: Object.keys(doneSteps).length,
      createdAt: plans[currentPlanId] && plans[currentPlanId].createdAt || Date.now(),
      updatedAt: Date.now(),
      history: chatHistory,
      state: workshopState,
      doneSteps: doneSteps,
      lastMessage: lastMessage
    };
    savePlans(plans);
    updateUrlPlanId(currentPlanId);
    if (Q.sidebar) Q.sidebar.refresh();
  }

  function loadPlan(planId) {
    var plan = getPlan(planId);
    if (!plan) return false;
    currentPlanId = planId;
    chatHistory = plan.history || [];
    workshopState = plan.state || {};
    doneSteps = plan.doneSteps || {};
    renderMessages();
    if (Q.sidebar) Q.sidebar.refresh();
    return true;
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    if (sendBtn) sendBtn.addEventListener("click", onSend);
    if (inputEl) {
      inputEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onSend();
        }
      });
    }
  }

  // ---------- 初始化 ----------
  function init() {
    bindEvents();
    renderCreateShowcase();
    var planId = getUrlPlanId();
    if (planId && loadPlan(planId)) {
      // 已恢复历史
    } else {
      renderWelcome();
    }
  }

  init();

  Q.chat = {
    reset: reset,
    savePlan: savePlan,
    loadPlan: loadPlan,
    getState: function () { return workshopState; },
    getHistory: function () { return chatHistory; }
  };
})(window.Qinghe);
