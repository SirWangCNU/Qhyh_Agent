/* ============================================================
   plan.js · 规划设计项目管理页
   依赖：router.js（暴露 window.Qinghe.router）
   暴露：window.Qinghe.plan
   ============================================================ */

window.Qinghe = window.Qinghe || {};

(function (Q) {
  "use strict";

  var STORAGE_KEY = "qinghe_plans";
  var TOTAL_STEPS = 5;

  // 转义 HTML，防止用户输入污染页面
  function escapeHtml(text) {
    if (text == null) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // 读取方案列表（chat.js 以 {planId: {...}} 对象格式存储，这里转为数组）
  function loadPlans() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object") {
        return Object.keys(parsed).map(function (k) { return parsed[k]; });
      }
      return [];
    } catch (e) {
      console.warn("[plan] 读取方案列表失败：", e);
      return [];
    }
  }

  // 保存方案列表（转回 chat.js 的 {planId: {...}} 对象格式）
  function savePlans(plans) {
    try {
      var obj = {};
      plans.forEach(function (p) { if (p && p.id) obj[p.id] = p; });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn("[plan] 保存方案列表失败：", e);
    }
  }

  // 格式化日期：YYYY-MM-DD HH:mm
  function formatDate(isoString) {
    if (!isoString) return "—";
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return "—";
    var pad = function (n) { return n < 10 ? "0" + n : n; };
    return (
      d.getFullYear() + "-" +
      pad(d.getMonth() + 1) + "-" +
      pad(d.getDate()) + " " +
      pad(d.getHours()) + ":" +
      pad(d.getMinutes())
    );
  }

  // 截断文本到指定长度
  function truncate(text, maxLen) {
    var s = text == null ? "" : String(text).replace(/\s+/g, " ").trim();
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen) + "…";
  }

  // 渲染空状态
  function renderEmpty(container) {
    container.innerHTML =
      '<div class="plan-empty">' +
        '<div class="plan-empty__icon">' +
          '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">' +
            '<path d="M24 6C16 10 10 18 10 28C10 34 14 40 24 42C34 40 38 34 38 28C38 18 32 10 24 6Z" stroke-linejoin="round"/>' +
            '<path d="M24 42V46M18 22L24 28L30 22M18 28L24 34L30 28" stroke-linecap="round" stroke-linejoin="round"/>' +
          '</svg>' +
        '</div>' +
        '<h3 class="plan-empty__title">还没有创作方案</h3>' +
        '<p class="plan-empty__desc">新建一个方案，开始和你的 AI 创作助手对话规划短视频内容。</p>' +
        '<button class="btn btn--primary plan-empty__cta" data-action="new">' +
          '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
            '<path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
          '</svg>' +
          '新建方案' +
        '</button>' +
      '</div>';
  }

  // 渲染方案列表
  function renderPlanList() {
    var container = document.getElementById("planList");
    if (!container) return;

    var plans = loadPlans();
    if (plans.length === 0) {
      renderEmpty(container);
      bindCardActions(container);
      return;
    }

    // 按更新时间倒序
    plans.sort(function (a, b) {
      var ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      var tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tb - ta;
    });

    var html = '<div class="plan-grid">';
    plans.forEach(function (plan) {
      var progress = Math.max(0, Math.min(TOTAL_STEPS, Number(plan.progress) || 0));
      var title = plan.title ? String(plan.title) : "未命名方案";
      var created = formatDate(plan.createdAt);
      var message = plan.lastMessage
        ? truncate(plan.lastMessage, 60)
        : "";

      html +=
        '<article class="plan-card" data-plan-id="' + escapeHtml(plan.id) + '">' +
          '<div class="plan-card__header">' +
            '<h3 class="plan-card__title">' + escapeHtml(title) + '</h3>' +
            '<span class="plan-card__progress">已完成 ' + progress + "/" + TOTAL_STEPS + " 步</span>" +
          '</div>' +
          '<div class="plan-card__meta">创建于 <time>' + escapeHtml(created) + '</time></div>' +
          '<div class="plan-card__message">' +
            (message ? escapeHtml(message) : '<em>暂无对话内容</em>') +
          '</div>' +
          '<div class="plan-card__actions">' +
            '<button class="btn btn--primary" data-action="continue">继续</button>' +
            '<button class="btn btn--danger" data-action="delete">删除</button>' +
          '</div>' +
        '</article>';
    });
    html += "</div>";

    container.innerHTML = html;
    bindCardActions(container);
  }

  // 绑定卡片内按钮事件（事件委托）
  function bindCardActions(container) {
    container.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action]");
      if (!btn) return;

      var card = btn.closest("[data-plan-id]");
      var action = btn.getAttribute("data-action");
      var planId = card ? card.getAttribute("data-plan-id") : null;

      if (action === "new") {
        window.location.hash = "#/chat";
        return;
      }

      if (action === "continue") {
        if (planId) {
          window.location.hash = "#/chat?planId=" + encodeURIComponent(planId);
        }
        return;
      }

      if (action === "delete") {
        if (!planId) return;
        var plan = loadPlans().find(function (p) { return p.id === planId; });
        var title = plan && plan.title ? plan.title : "该方案";
        if (confirm("确定要删除「" + title + "」吗？删除后不可恢复。")) {
          var remaining = loadPlans().filter(function (p) { return p.id !== planId; });
          savePlans(remaining);
          renderPlanList();
          if (window.Qinghe && window.Qinghe.sidebar) window.Qinghe.sidebar.refresh();
        }
      }
    });
  }

  // 绑定顶部“新建方案”按钮
  function bindNewButton() {
    var btn = document.getElementById("planNewBtn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      window.location.hash = "#/chat";
    });
  }

  // 在路由切换到 #/plan 时重新渲染
  function mount() {
    renderPlanList();
    bindNewButton();
  }

  // 页面加载或 hash 切换到 #/plan 时自动挂载
  function maybeMount() {
    if (window.location.hash === "#/plan") {
      mount();
    }
  }

  window.addEventListener("load", maybeMount);
  window.addEventListener("hashchange", maybeMount);

  Q.plan = {
    loadPlans: loadPlans,
    savePlans: savePlans,
    renderPlanList: renderPlanList,
    mount: mount
  };
})(window.Qinghe);
