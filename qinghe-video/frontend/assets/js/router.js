/* ============================================================
   router.js · 哈希前端路由
   依赖：无
   暴露：window.Qinghe.router
   ============================================================ */

window.Qinghe = window.Qinghe || {};

(function (Q) {
  "use strict";

  var routes = {};
  var currentRoute = null;

  // 去除 hash 中的查询参数，用于路由匹配
  function cleanHash(hash) {
    if (!hash) return "";
    return hash.split("?")[0];
  }

  // 显示指定 ID 的页面区块，并隐藏其它 .page-section
  function showSection(id) {
    var target = id ? document.getElementById(id) : null;
    if (!target) return false;

    document.querySelectorAll(".page-section").forEach(function (el) {
      el.classList.remove("is-active");
    });
    target.classList.add("is-active");

    // 激活当前区块内的 reveal 动画，避免延迟显示时动画未触发
    target.querySelectorAll(".reveal").forEach(function (el) {
      el.classList.add("is-in");
    });
    return true;
  }

  // 更新顶部导航高亮
  function updateNavActive(route) {
    var activeRoute = (route || "").replace(/^#\//, "");
    if (!activeRoute) activeRoute = "chat";
    document.querySelectorAll(".site-nav__link").forEach(function (link) {
      link.classList.toggle("is-active", link.getAttribute("data-route") === activeRoute);
    });
  }

  // 触发已注册的路由回调
  function dispatch(hash) {
    var key = cleanHash(hash);
    var handler = routes[key];
    if (handler) {
      handler(key);
    }
    currentRoute = key;
    updateNavActive(key);
    // 切换路由后将主内容区滚动回顶部
    var body = document.getElementById("siteBody");
    if (body) body.scrollTop = 0;
  }

  // 处理 hash 变化；
  // #/ 开头的路由走注册表；传统锚点若目标是 .page-section 则按同名路由激活
  function handleHash() {
    var hash = window.location.hash;
    if (!hash || hash === "#") {
      window.location.hash = "#/create";
      return;
    }
    if (hash.indexOf("#/") === 0) {
      dispatch(hash);
      return;
    }
    var id = hash.slice(1);
    var el = document.getElementById(id);
    if (el && el.classList.contains("page-section")) {
      dispatch("#/" + id);
    }
  }

  // 注册路由处理器
  function register(route, callback) {
    if (typeof route !== "string" || typeof callback !== "function") return;
    if (route.indexOf("#") !== 0) route = "#" + route;
    routes[route] = callback;
  }

  // 跳转到指定 hash
  function navigate(hash) {
    if (!hash) hash = "#/create";
    if (hash.indexOf("#") !== 0) hash = "#" + hash;
    if (hash === "#") hash = "#/create";
    window.location.hash = hash;
  }

  // 返回当前路由
  function current() {
    if (currentRoute) return currentRoute;
    var hash = window.location.hash;
    if (!hash || hash === "#") return "#/create";
    return hash;
  }

  // 内置路由：create / chat / plan / agents / workshop
  register("#/", function () { showSection("createPage"); });
  register("#/create", function () { showSection("createPage"); });
  register("#/chat", function () { showSection("chatPage"); });
  register("#/plan", function () { showSection("planPage"); });
  register("#/agents", function () { showSection("agentsPage"); });
  register("#/workshop", function () { showSection("workshop"); });
  register("#/image-studio", function () { showSection("imageStudioPage"); });

  window.addEventListener("hashchange", handleHash);
  window.addEventListener("load", handleHash);

  Q.router = {
    register: register,
    navigate: navigate,
    current: current
  };
})(window.Qinghe);
