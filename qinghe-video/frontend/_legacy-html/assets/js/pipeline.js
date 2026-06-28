/* ============================================================
   pipeline.js · 流水线进度模块
   负责：节点渲染、状态更新、进度条
   ============================================================ */

window.Qinghe = window.Qinghe || {};

(function (Q) {
  "use strict";

  // Agent 节点定义（顺序即流水线顺序）
  var NODES = [
    { key: "planner", label: "策划", icon: "target" },
    { key: "copywriter", label: "文案", icon: "pen" },
    { key: "scriptwriter", label: "脚本", icon: "film" },
    { key: "visual_designer", label: "视觉", icon: "palette" },
    { key: "distributor", label: "投放", icon: "broadcast" },
    { key: "report_generator", label: "报告", icon: "doc" }
  ];

  // SVG 图标集
  var ICONS = {
    target: '<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.5"/><circle cx="11" cy="11" r="3" stroke="currentColor" stroke-width="1.5"/><circle cx="11" cy="11" r="1" fill="currentColor"/>',
    pen: '<path d="M14 3L21 10L8 23L1 23L1 16L14 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" transform="scale(0.7) translate(4 2)"/>',
    film: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M3 9H21M3 15H21M8 4V20M16 4V20" stroke="currentColor" stroke-width="1.3"/>',
    palette: '<path d="M12 3C7 3 3 7 3 12C3 17 7 21 12 21C13 21 14 20 14 19C14 18 13 18 13 17C13 16 14 15 15 15H17C19 15 21 13 21 11C21 6 17 3 12 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="8" cy="10" r="1.2" fill="currentColor"/><circle cx="12" cy="7" r="1.2" fill="currentColor"/><circle cx="16" cy="9" r="1.2" fill="currentColor"/>',
    broadcast: '<path d="M5 14C5 14 7 12 12 12C17 12 19 14 19 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M2 11C2 11 6 8 12 8C18 8 22 11 22 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="17" r="1.5" fill="currentColor"/>',
    doc: '<path d="M6 3H14L19 8V21H6V3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M14 3V8H19" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 13H16M9 17H16" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>'
  };

  var flowEl = document.getElementById("pipelineFlow");
  var progressFill = document.getElementById("progressFill");
  var statusLine = document.getElementById("statusLine");
  var statusText = document.getElementById("statusText");

  // 渲染节点骨架
  function renderNodes() {
    if (!flowEl) return;
    flowEl.innerHTML = NODES.map(function (n, i) {
      return (
        '<div class="node" data-node="' + n.key + '">' +
          '<div class="node__icon"><svg viewBox="0 0 24 24" fill="none">' + (ICONS[n.icon] || "") + "</svg></div>" +
          '<div class="node__label">' + n.label + "</div>" +
          '<div class="node__step">0' + (i + 1) + "</div>" +
        "</div>"
      );
    }).join("");
  }

  // 更新单个节点状态
  function setNodeState(key, state) {
    var el = flowEl.querySelector('[data-node="' + key + '"]');
    if (!el) return;
    el.classList.remove("is-active", "is-done", "is-error");
    if (state) el.classList.add("is-" + state);
  }

  // 重置所有节点
  function resetNodes() {
    NODES.forEach(function (n) { setNodeState(n.key, null); });
  }

  // 更新进度条（0~1）
  function setProgress(ratio, label) {
    if (progressFill) progressFill.style.width = (Math.max(0, Math.min(1, ratio)) * 100) + "%";
    if (label && statusText) statusText.textContent = label;
  }

  // 更新状态行
  function setStatus(text, type) {
    if (statusText) statusText.innerHTML = text;
    if (!statusLine) return;
    statusLine.classList.remove("is-success", "is-error");
    if (type) statusLine.classList.add("is-" + type);
  }

  // 获取节点索引
  function nodeIndex(key) {
    for (var i = 0; i < NODES.length; i++) {
      if (NODES[i].key === key) return i;
    }
    return 0;
  }

  function nodeCount() { return NODES.length; }
  function nodeLabel(key) {
    for (var i = 0; i < NODES.length; i++) {
      if (NODES[i].key === key) return NODES[i].label;
    }
    return key;
  }

  // 初始化
  renderNodes();

  // 暴露接口
  Q.pipeline = {
    NODES: NODES,
    renderNodes: renderNodes,
    setNodeState: setNodeState,
    resetNodes: resetNodes,
    setProgress: setProgress,
    setStatus: setStatus,
    nodeIndex: nodeIndex,
    nodeCount: nodeCount,
    nodeLabel: nodeLabel
  };
})(window.Qinghe);
