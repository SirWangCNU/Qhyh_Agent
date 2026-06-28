/* ============================================================
   sidebar.js · 左侧边栏模块
   职责：折叠状态、方案历史列表、当前生成进度展示
   依赖：pipeline.js（Q.pipeline）、chat.js（Q.chat）、router.js（Q.router）
   暴露：window.Qinghe.sidebar
   ============================================================ */

window.Qinghe = window.Qinghe || {};

(function (Q) {
  "use strict";

  var STORAGE_KEY = "qinghe_sidebar_collapsed";
  var PLANS_KEY = "qinghe_plans";

  var sidebar = document.getElementById("siteSidebar");
  var toggleBtn = document.getElementById("sidebarToggle");
  var brandTrigger = document.getElementById("brandTrigger");
  var siteBody = document.getElementById("siteBody");
  var newPlanBtn = document.getElementById("sidebarNewPlan");
  var progressEl = document.getElementById("sidebarProgress");
  var planListEl = document.getElementById("sidebarPlanList");

  var isExpanded = false;
  var progressVisible = false;

  // ---------- 工具函数 ----------
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function truncate(text, maxLen) {
    var s = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen) + "…";
  }

  function formatDate(ts) {
    if (!ts) return "—";
    var d = new Date(ts);
    if (isNaN(d.getTime())) return "—";
    var pad = function (n) { return n < 10 ? "0" + n : n; };
    return pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  // ---------- 折叠状态 ----------
  function loadCollapsedState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      // "true" 表示折叠，默认折叠
      return raw !== "false";
    } catch (e) {
      return true;
    }
  }

  function saveCollapsedState(collapsed) {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch (e) { /* ignore */ }
  }

  function applyState() {
    if (!sidebar) return;
    if (isExpanded) {
      sidebar.classList.remove("is-collapsed");
      sidebar.classList.add("is-expanded");
      if (toggleBtn) toggleBtn.title = "收起边栏";
    } else {
      sidebar.classList.remove("is-expanded");
      sidebar.classList.add("is-collapsed");
      if (toggleBtn) toggleBtn.title = "展开边栏";
    }
    dispatchLayoutEvent();
  }

  function toggle() {
    isExpanded = !isExpanded;
    saveCollapsedState(!isExpanded);
    applyState();
  }

  // ---------- 方案列表 ----------
  function loadPlans() {
    try {
      var raw = localStorage.getItem(PLANS_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object") {
        return Object.keys(parsed).map(function (k) { return parsed[k]; });
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  function getActivePlanId() {
    var hash = window.location.hash || "";
    var m = hash.match(/[?&]planId=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function renderPlans() {
    if (!planListEl) return;

    var plans = loadPlans();
    var activeId = getActivePlanId();

    if (plans.length === 0) {
      planListEl.innerHTML = '<div class="sidebar__empty">暂无方案</div>';
      return;
    }

    plans.sort(function (a, b) {
      var ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      var tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tb - ta;
    });

    var html = "";
    plans.forEach(function (plan, idx) {
      var id = plan.id || "";
      var title = plan.title ? String(plan.title) : "未命名方案";
      var date = formatDate(plan.updatedAt);
      var isActive = id === activeId;
      var iconText = String(title).charAt(0) || "#";

      html +=
        '<button type="button" class="sidebar__plan-item' + (isActive ? " is-active" : "") + '" data-plan-id="' + escapeHtml(id) + '" title="' + escapeHtml(title) + '">'
        + '<span class="sidebar__plan-icon">' + escapeHtml(iconText) + '</span>'
        + '<span class="sidebar__plan-title">' + escapeHtml(truncate(title, 18)) + '</span>'
        + '</button>';
    });

    planListEl.innerHTML = html;
  }

  function bindPlanClicks() {
    if (!planListEl) return;
    planListEl.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-plan-id]");
      if (!btn) return;
      var planId = btn.getAttribute("data-plan-id");
      loadPlan(planId);
    });
  }

  function loadPlan(planId) {
    if (!planId) return;
    if (Q.chat && typeof Q.chat.loadPlan === "function") {
      Q.chat.loadPlan(planId);
    }
    if (Q.router && typeof Q.router.navigate === "function") {
      Q.router.navigate("#/chat?planId=" + encodeURIComponent(planId));
    } else {
      window.location.hash = "#/chat?planId=" + encodeURIComponent(planId);
    }
    // 高亮当前项
    renderPlans();
  }

  function newPlan() {
    if (Q.chat && typeof Q.chat.reset === "function") {
      Q.chat.reset();
    }
    if (Q.router && typeof Q.router.navigate === "function") {
      Q.router.navigate("#/chat");
    } else {
      window.location.hash = "#/chat";
    }
    renderPlans();
  }

  // ---------- 进度显示 ----------
  function showProgress() {
    if (progressEl) progressEl.hidden = false;
    progressVisible = true;
  }

  function hideProgress() {
    if (progressEl) progressEl.hidden = true;
    progressVisible = false;
  }

  function resetProgress() {
    if (Q.pipeline && typeof Q.pipeline.resetNodes === "function") {
      Q.pipeline.resetNodes();
    }
    if (Q.pipeline && typeof Q.pipeline.setProgress === "function") {
      Q.pipeline.setProgress(0, "就绪");
    }
  }

  function setNodeState(key, state) {
    if (Q.pipeline && typeof Q.pipeline.setNodeState === "function") {
      Q.pipeline.setNodeState(key, state);
    }
  }

  function setProgress(ratio, label) {
    if (Q.pipeline && typeof Q.pipeline.setProgress === "function") {
      Q.pipeline.setProgress(ratio, label);
    }
  }

  function setStatus(text, type) {
    if (Q.pipeline && typeof Q.pipeline.setStatus === "function") {
      Q.pipeline.setStatus(text, type);
    }
  }

  // ---------- 刷新与同步 ----------
  function refresh() {
    renderPlans();
  }

  function dispatchLayoutEvent() {
    window.dispatchEvent(new CustomEvent("qinghe:layout"));
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    if (toggleBtn) toggleBtn.addEventListener("click", toggle);
    if (brandTrigger) brandTrigger.addEventListener("click", toggle);
    if (newPlanBtn) newPlanBtn.addEventListener("click", newPlan);
    bindPlanClicks();

    // 点击边栏外部关闭边栏
    document.addEventListener("click", function (e) {
      if (!isExpanded) return;
      var insideSidebar = sidebar && sidebar.contains(e.target);
      var insideTrigger = brandTrigger && brandTrigger.contains(e.target);
      var insideToggle = toggleBtn && toggleBtn.contains(e.target);
      if (!insideSidebar && !insideTrigger && !insideToggle) {
        toggle();
      }
    });

    window.addEventListener("hashchange", function () {
      renderPlans();
    });
  }

  // ---------- 初始化 ----------
  function init() {
    if (!sidebar) {
      console.warn("[sidebar] 未找到边栏 DOM");
      return;
    }
    isExpanded = !loadCollapsedState();
    applyState();
    bindEvents();
    renderPlans();
  }

  init();

  Q.sidebar = {
    toggle: toggle,
    refresh: refresh,
    renderPlans: renderPlans,
    loadPlan: loadPlan,
    newPlan: newPlan,
    showProgress: showProgress,
    hideProgress: hideProgress,
    resetProgress: resetProgress,
    setNodeState: setNodeState,
    setProgress: setProgress,
    setStatus: setStatus,
    isExpanded: function () { return isExpanded; },
    isProgressVisible: function () { return progressVisible; }
  };
})(window.Qinghe);
