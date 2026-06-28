/* ============================================================
   form.js · 表单模块
   负责：表单数据收集、校验、提交状态
   ============================================================ */

window.Qinghe = window.Qinghe || {};

(function (Q) {
  "use strict";

  var form = document.getElementById("createForm");
  var btn = document.getElementById("generateBtn");
  var btnText = document.getElementById("btnText");

  // 收集表单数据
  function collect() {
    if (!form) return {};
    var data = {};
    var fields = form.querySelectorAll("input, textarea, select");
    fields.forEach(function (f) {
      if (f.name) data[f.name] = f.value.trim();
    });
    return data;
  }

  // 校验必填项
  function validate() {
    var required = ["product_name", "origin", "category", "selling_points"];
    var data = collect();
    for (var i = 0; i < required.length; i++) {
      if (!data[required[i]]) {
        return { ok: false, field: required[i], message: "请完整填写带 * 号的必填项" };
      }
    }
    return { ok: true, data: data };
  }

  // 锁定/解锁表单
  function setLocked(locked) {
    if (!form) return;
    var fields = form.querySelectorAll("input, textarea, select");
    fields.forEach(function (f) { f.disabled = locked; });
    if (btn) btn.disabled = locked;
    if (btnText) btnText.textContent = locked ? "生成中…" : "一键生成创作方案";
  }

  // 暴露接口
  Q.form = {
    collect: collect,
    validate: validate,
    setLocked: setLocked,
    el: form,
    btn: btn,
    btnText: btnText
  };
})(window.Qinghe);
