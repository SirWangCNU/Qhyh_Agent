/* ============================================================
   auth.js · 前端鉴权模块
   职责：token 管理、fetch 包装、登录/注册 UI 逻辑
   依赖：Qinghe 命名空间（pipeline.js 中定义）
   ============================================================ */

(function () {
  "use strict";

  var Q = window.Qinghe || (window.Qinghe = {});
  var TOKEN_KEY = "qinghe_token";
  var USER_KEY = "qinghe_user";

  // 后端地址
  var BACKEND_URL = (window.__QINGHE_CONFIG__ && window.__QINGHE_CONFIG__.BACKEND_URL) || "http://localhost:18739";
  BACKEND_URL = BACKEND_URL.replace(/\/+$/, "");

  // ============================================================
  // Token 管理
  // ============================================================

  Q.auth = {
    getToken: function () {
      try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
    },
    setToken: function (t) {
      try { localStorage.setItem(TOKEN_KEY, t); } catch (e) { /* ignore */ }
    },
    clearToken: function () {
      try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
    },
    getUser: function () {
      try {
        var raw = localStorage.getItem(USER_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },
    setUser: function (u) {
      try { localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch (e) { /* ignore */ }
    },
    clearUser: function () {
      try { localStorage.removeItem(USER_KEY); } catch (e) { /* ignore */ }
    },

    // ============================================================
    // 登录/注册 API
    // ============================================================

    login: function (username, password) {
      return fetch(BACKEND_URL + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username, password: password }),
      }).then(function (resp) {
        if (!resp.ok) return resp.json().then(function (d) { throw new Error(d.detail || "登录失败"); });
        return resp.json();
      }).then(function (data) {
        Q.auth.setToken(data.access_token);
        Q.auth.setUser({ username: data.username, role: data.role });
        return data;
      });
    },

    register: function (username, password) {
      return fetch(BACKEND_URL + "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username, password: password }),
      }).then(function (resp) {
        if (!resp.ok) return resp.json().then(function (d) { throw new Error(d.detail || "注册失败"); });
        return resp.json();
      });
    },

    logout: function () {
      Q.auth.clearToken();
      Q.auth.clearUser();
      Q.auth.showOverlay();
      Q.auth.updateNavLogout();
    },

    // ============================================================
    // UI 控制
    // ============================================================

    showOverlay: function () {
      var overlay = document.getElementById("authOverlay");
      if (overlay) overlay.hidden = false;
      var main = document.querySelector("main");
      if (main) main.style.display = "none";
      var header = document.querySelector(".site-header");
      if (header) header.style.display = "none";
      var footer = document.querySelector("footer");
      if (footer) footer.style.display = "none";
      var sidebar = document.getElementById("siteSidebar");
      if (sidebar) sidebar.style.display = "none";
    },

    hideOverlay: function () {
      var overlay = document.getElementById("authOverlay");
      if (overlay) {
        overlay.classList.add("is-hiding");
        setTimeout(function () {
          overlay.hidden = true;
          overlay.classList.remove("is-hiding");
        }, 300);
      }
      var main = document.querySelector("main");
      if (main) main.style.display = "";
      var header = document.querySelector(".site-header");
      if (header) header.style.display = "";
      var footer = document.querySelector("footer");
      if (footer) footer.style.display = "";
      var sidebar = document.getElementById("siteSidebar");
      if (sidebar) sidebar.style.display = "";
    },

    updateNavLogout: function () {
      var btn = document.getElementById("navLogout");
      if (!btn) return;
      var user = Q.auth.getUser();
      if (user && Q.auth.getToken()) {
        btn.hidden = false;
      } else {
        btn.hidden = true;
      }
    },

    // 页面加载时检查
    requireAuth: function () {
      if (Q.auth.getToken()) {
        Q.auth.hideOverlay();
        Q.auth.updateNavLogout();
      } else {
        Q.auth.showOverlay();
      }
    },
  };

  // ============================================================
  // fetch 包装：自动注入 Authorization 头，401 时登出
  // ============================================================

  var originalFetch = window.fetch;
  window.fetch = function (url, opts) {
    opts = opts || {};
    var target = typeof url === "string" ? url : (url && url.url) || "";
    // 仅对 /api/ 请求注入 token
    if (target.indexOf("/api/") !== -1) {
      var token = Q.auth.getToken();
      if (token) {
        if (!opts.headers) {
          opts.headers = {};
        }
        if (opts.headers instanceof Headers) {
          opts.headers.set("Authorization", "Bearer " + token);
        } else if (typeof opts.headers === "object") {
          opts.headers["Authorization"] = "Bearer " + token;
        }
      }
    }
    return originalFetch.call(this, url, opts).then(function (resp) {
      // 对于 /api/ 请求的 401，触发登出（排除 auth 接口本身避免循环）
      if (resp.status === 401 && target.indexOf("/api/") !== -1 &&
          target.indexOf("/api/auth/login") === -1 &&
          target.indexOf("/api/auth/register") === -1) {
        Q.auth.logout();
      }
      return resp;
    });
  };

  // ============================================================
  // DOM 事件绑定
  // ============================================================

  document.addEventListener("DOMContentLoaded", function () {
    var loginForm = document.getElementById("loginForm");
    var registerForm = document.getElementById("registerForm");
    var toggleLink = document.getElementById("authToggle");
    var loginErr = document.getElementById("loginError");
    var registerErr = document.getElementById("registerError");
    var loginBtn = document.getElementById("loginBtn");
    var registerBtn = document.getElementById("registerBtn");
    var logoutBtn = document.getElementById("navLogout");
    var isLoginMode = true;

    // 切换登录/注册
    if (toggleLink) {
      toggleLink.addEventListener("click", function (e) {
        e.preventDefault();
        isLoginMode = !isLoginMode;
        if (loginForm) loginForm.hidden = !isLoginMode;
        if (registerForm) registerForm.hidden = isLoginMode;
        if (loginErr) loginErr.textContent = "";
        if (registerErr) registerErr.textContent = "";
        toggleLink.innerHTML = isLoginMode
          ? '还没有账号？<a href="#">立即注册</a>'
          : '已有账号？<a href="#">立即登录</a>';
      });
    }

    // 登录表单
    if (loginForm) {
      loginForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var username = (document.getElementById("loginUsername") || {}).value || "";
        var password = (document.getElementById("loginPassword") || {}).value || "";
        if (!username.trim() || !password.trim()) {
          if (loginErr) loginErr.textContent = "请输入用户名和密码";
          return;
        }
        if (loginBtn) { loginBtn.disabled = true; loginBtn.classList.add("auth-btn--loading"); }
        if (loginErr) loginErr.textContent = "";
        Q.auth.login(username.trim(), password)
          .then(function () {
            Q.auth.hideOverlay();
            Q.auth.updateNavLogout();
          })
          .catch(function (err) {
            if (loginErr) loginErr.textContent = err.message || "登录失败";
          })
          .finally(function () {
            if (loginBtn) { loginBtn.disabled = false; loginBtn.classList.remove("auth-btn--loading"); }
          });
      });
    }

    // 注册表单
    if (registerForm) {
      registerForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var username = (document.getElementById("registerUsername") || {}).value || "";
        var password = (document.getElementById("registerPassword") || {}).value || "";
        if (!username.trim() || !password.trim()) {
          if (registerErr) registerErr.textContent = "请输入用户名和密码";
          return;
        }
        if (password.length < 6) {
          if (registerErr) registerErr.textContent = "密码至少 6 个字符";
          return;
        }
        if (registerBtn) { registerBtn.disabled = true; registerBtn.classList.add("auth-btn--loading"); }
        if (registerErr) registerErr.textContent = "";
        Q.auth.register(username.trim(), password)
          .then(function () {
            // 注册成功，自动登录
            return Q.auth.login(username.trim(), password);
          })
          .then(function () {
            Q.auth.hideOverlay();
            Q.auth.updateNavLogout();
          })
          .catch(function (err) {
            if (registerErr) registerErr.textContent = err.message || "注册失败";
          })
          .finally(function () {
            if (registerBtn) { registerBtn.disabled = false; registerBtn.classList.remove("auth-btn--loading"); }
          });
      });
    }

    // 登出按钮
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        Q.auth.logout();
      });
    }

    // 初始化：检查登录状态
    Q.auth.requireAuth();
  });
})();
