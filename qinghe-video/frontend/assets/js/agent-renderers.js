/* ============================================================
   agent-renderers.js · Agent 输出结构化渲染
   把每个 Agent 的 JSON 产物按字段渲染为编辑式卡片 / 表格 / 列表，
   替代原先把 JSON 塞进 <pre> 的做法。
   依赖：window.Qinghe 命名空间（由 workshop.js / app.js 共建）。
   ============================================================ */

window.Qinghe = window.Qinghe || {};

(function (Q) {
  "use strict";

  // ---------- 基础工具 ----------
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function safeList(v) {
    return Array.isArray(v) ? v : [];
  }

  // 字段卡片：小号大写灰色标签 + 正文值
  function fieldCard(label, valueHtml) {
    return (
      '<div class="field-card">'
      + '<div class="field-card__label">' + escapeHtml(label) + '</div>'
      + '<div class="field-card__value">' + valueHtml + '</div>'
      + '</div>'
    );
  }

  // 无序列表字段
  function fieldList(label, items) {
    var arr = safeList(items);
    if (!arr.length) return fieldCard(label, '<span class="field-empty">—</span>');
    var lis = arr.map(function (it) {
      return '<li>' + escapeHtml(it) + '</li>';
    }).join("");
    return fieldCard(label, '<ul class="field-list">' + lis + '</ul>');
  }

  // 嵌套子字段（用于 target_audience / publish_strategy 等对象）
  function fieldObject(label, obj, schema) {
    obj = obj || {};
    var rows = schema.map(function (s) {
      return (
        '<div class="field-sub">'
        + '<span class="field-sub__k">' + escapeHtml(s.label) + '</span>'
        + '<span class="field-sub__v">' + escapeHtml(obj[s.key]) + '</span>'
        + '</div>'
      );
    }).join("");
    return fieldCard(label, '<div class="field-sub-group">' + rows + '</div>');
  }

  // 复制按钮：用 data-copy 存 encodeURIComponent 后的文本，事件委托统一处理
  function copyBtn(text, label) {
    var encoded;
    try { encoded = encodeURIComponent(String(text)); }
    catch (e) { encoded = ""; }
    return (
      '<button type="button" class="copy-btn" data-copy="' + encoded + '">'
      + escapeHtml(label || "复制")
      + '</button>'
    );
  }

  // 包裹外层容器
  function wrap(stepKey, innerHtml) {
    return '<div class="agent-output" data-step="' + escapeHtml(stepKey) + '">' + innerHtml + '</div>';
  }

  // ============ Planner 策划 ============
  function renderPlanner(o) {
    var ta = o.target_audience || {};
    var html = "";
    html += fieldCard("主题", escapeHtml(o.theme));
    html += fieldList("核心卖点", o.core_selling_points);
    html += fieldObject("目标受众", ta, [
      { key: "age_range", label: "年龄区间" },
      { key: "region", label: "地域" },
      { key: "consumer_profile", label: "消费画像" }
    ]);
    html += fieldCard("情绪基调", escapeHtml(o.emotion_tone));
    html += fieldCard("创意角度", escapeHtml(o.creative_angle));
    html += fieldCard("视频类型", escapeHtml(o.video_type));
    if (o.strategy_notes) html += fieldCard("策略补充", escapeHtml(o.strategy_notes));
    return wrap("planner", html);
  }

  // ============ Copywriter 文案 ============
  function renderCopywriter(o) {
    var html = "";
    var hook = o.hook || {};
    var cta = o.cta || {};
    var body = safeList(o.body);

    // hook：大号引号样式
    html += (
      '<blockquote class="hook-card">'
      + '<p class="hook-card__text">“' + escapeHtml(hook.text) + '”</p>'
      + (hook.delivery_note ? '<p class="hook-card__note">' + escapeHtml(hook.delivery_note) + '</p>' : '')
      + '</blockquote>'
    );

    // body 段落
    if (body.length) {
      html += '<div class="field-card"><div class="field-card__label">口播正文</div><div class="field-card__value">';
      body.forEach(function (seg) {
        html += (
          '<div class="body-seg">'
          + '<div class="body-seg__head">段落 ' + escapeHtml(seg.segment) + '</div>'
          + '<p class="body-seg__text">' + escapeHtml(seg.text) + '</p>'
          + (seg.delivery_note ? '<p class="body-seg__note">语气 · ' + escapeHtml(seg.delivery_note) + '</p>' : '')
          + '</div>'
        );
      });
      html += '</div></div>';
    }

    // full_script：正文段落 + 复制按钮
    if (o.full_script) {
      html += (
        '<div class="field-card">'
        + '<div class="field-card__label">完整口播稿</div>'
        + '<div class="field-card__value">'
        + copyBtn(o.full_script, "复制口播稿")
        + '<p class="full-script">' + escapeHtml(o.full_script) + '</p>'
        + '</div></div>'
      );
    }

    // cta：强调色卡片
    html += (
      '<div class="cta-card">'
      + '<div class="cta-card__label">行动号召 CTA</div>'
      + '<p class="cta-card__text">' + escapeHtml(cta.text) + '</p>'
      + (cta.delivery_note ? '<p class="cta-card__note">' + escapeHtml(cta.delivery_note) + '</p>' : '')
      + '</div>'
    );

    // 元信息
    var meta = [];
    if (o.estimated_duration_seconds != null) meta.push("预计时长 " + o.estimated_duration_seconds + " 秒");
    if (o.word_count != null) meta.push("字数 " + o.word_count);
    if (meta.length) html += '<p class="agent-meta">' + escapeHtml(meta.join(" · ")) + '</p>';

    return wrap("copywriter", html);
  }

  // ============ Scriptwriter 脚本 ============
  function renderScriptwriter(o) {
    var html = "";
    html += fieldCard("脚本标题", escapeHtml(o.title));
    if (o.total_duration_seconds != null) {
      html += fieldCard("总时长", escapeHtml(o.total_duration_seconds) + " 秒");
    }

    // BGM 建议
    var bgm = o.bgm_suggestion || {};
    if (bgm.style || bgm.mood) {
      html += fieldObject("BGM 建议", bgm, [
        { key: "style", label: "风格" },
        { key: "bpm_range", label: "BPM" },
        { key: "mood", label: "情绪" },
        { key: "reference", label: "参考" }
      ]);
    }

    // 分镜表
    var shots = safeList(o.shots);
    if (shots.length) {
      html += '<div class="field-card"><div class="field-card__label">分镜表</div><div class="field-card__value">';
      html += '<div class="shot-table-wrap"><table class="shot-table"><thead><tr>';
      ["镜头", "画面描述", "旁白", "运镜", "时长"].forEach(function (h) {
        html += '<th>' + escapeHtml(h) + '</th>';
      });
      html += '</tr></thead><tbody>';
      shots.forEach(function (s) {
        var dur = s.duration_seconds != null ? (s.duration_seconds + "s") : (s.start_time && s.end_time ? (escapeHtml(s.start_time) + "→" + escapeHtml(s.end_time)) : "—");
        html += (
          '<tr>'
          + '<td class="shot-table__num">' + escapeHtml(s.shot_id) + '</td>'
          + '<td>' + escapeHtml(s.visual_description) + '</td>'
          + '<td>' + escapeHtml(s.voiceover) + '</td>'
          + '<td>' + escapeHtml(s.camera_movement) + '</td>'
          + '<td class="shot-table__dur">' + escapeHtml(dur) + '</td>'
          + '</tr>'
        );
      });
      html += '</tbody></table></div>';
      html += '</div></div>';
    }

    if (o.production_notes) html += fieldCard("制作备注", escapeHtml(o.production_notes));
    return wrap("scriptwriter", html);
  }

  // ============ Visual Designer 视觉 ============
  function renderVisualDesigner(o) {
    var html = "";
    var vs = o.visual_style || {};
    if (vs.style || vs.color_palette) {
      html += fieldObject("整体视觉风格", vs, [
        { key: "style", label: "风格" },
        { key: "color_palette", label: "色彩" },
        { key: "aspect_ratio", label: "画幅" },
        { key: "quality_tags", label: "质量标签" }
      ]);
    }

    var prompts = safeList(o.shot_prompts);
    if (prompts.length) {
      html += '<div class="field-card"><div class="field-card__label">分镜 Prompt</div><div class="field-card__value">';
      html += '<div class="shot-prompt-list">';
      prompts.forEach(function (p) {
        html += (
          '<article class="shot-prompt-card">'
          + '<header class="shot-prompt-card__head">'
          + '<span class="shot-prompt-card__id">镜头 ' + escapeHtml(p.shot_id) + '</span>'
          + (p.recommended_tool ? '<span class="shot-prompt-card__tool">' + escapeHtml(p.recommended_tool) + '</span>' : '')
          + '</header>'
          + '<p class="shot-prompt-card__prompt">' + escapeHtml(p.prompt) + '</p>'
          + (p.negative_prompt ? '<p class="shot-prompt-card__neg">负面 · ' + escapeHtml(p.negative_prompt) + '</p>' : '')
          + '</article>'
        );
      });
      html += '</div>';
      html += '</div></div>';
    }

    if (o.consistency_guide) html += fieldCard("一致性指南", escapeHtml(o.consistency_guide));
    return wrap("visual_designer", html);
  }

  // ============ Distributor 投放 ============
  function renderDistributor(o) {
    var html = "";
    html += fieldCard("目标平台", escapeHtml(o.platform));

    var pc = o.publish_content || {};
    if (pc.title) {
      html += (
        '<div class="field-card field-card--accent">'
        + '<div class="field-card__label">发布标题</div>'
        + '<div class="field-card__value title-cloud">' + escapeHtml(pc.title) + '</div>'
        + '</div>'
      );
    }
    if (pc.description) html += fieldCard("发布描述", escapeHtml(pc.description));

    // hashtags：# 标签云
    var tags = safeList(pc.hashtags);
    if (tags.length) {
      var tagHtml = tags.map(function (t) {
        var name = String(t).replace(/^#/, "");
        return '<span class="hashtag">#' + escapeHtml(name) + '</span>';
      }).join("");
      html += fieldCard("话题标签", tagHtml);
    }
    if (pc.mention) html += fieldCard("@ 提及", escapeHtml(pc.mention));

    // 视频规格
    var vs = o.video_specs || {};
    if (vs.resolution || vs.aspect_ratio) {
      html += fieldObject("视频规格", vs, [
        { key: "resolution", label: "分辨率" },
        { key: "aspect_ratio", label: "画幅" },
        { key: "max_duration", label: "最大时长" },
        { key: "file_format", label: "格式" },
        { key: "fps", label: "帧率" }
      ]);
    }

    // 发布策略
    var ps = o.publish_strategy || {};
    if (ps.best_time || ps.frequency) {
      var psRows = [
        '<div class="field-sub"><span class="field-sub__k">最佳时间</span><span class="field-sub__v">' + escapeHtml(ps.best_time) + '</span></div>',
        '<div class="field-sub"><span class="field-sub__k">频率</span><span class="field-sub__v">' + escapeHtml(ps.frequency) + '</span></div>'
      ];
      if (safeList(ps.best_days).length) {
        psRows.push('<div class="field-sub"><span class="field-sub__k">最佳日期</span><span class="field-sub__v">' + escapeHtml(safeList(ps.best_days).join("、")) + '</span></div>');
      }
      if (ps.first_comment) {
        psRows.push('<div class="field-sub"><span class="field-sub__k">首条评论</span><span class="field-sub__v">' + escapeHtml(ps.first_comment) + '</span></div>');
      }
      html += fieldCard("发布策略", '<div class="field-sub-group">' + psRows.join("") + '</div>');
    }

    // 推广建议
    var promos = safeList(o.promotion_suggestions);
    if (promos.length) {
      var promoHtml = promos.map(function (p) {
        return (
          '<div class="promo-item">'
          + '<div class="promo-item__type">' + escapeHtml(p.type) + '</div>'
          + '<p class="promo-item__desc">' + escapeHtml(p.description) + '</p>'
          + (p.budget_hint ? '<p class="promo-item__budget">预算 · ' + escapeHtml(p.budget_hint) + '</p>' : '')
          + '</div>'
        );
      }).join("");
      html += fieldCard("推广策略", promoHtml);
    }

    if (o.platform_specific_notes) html += fieldCard("平台备注", escapeHtml(o.platform_specific_notes));
    return wrap("distributor", html);
  }

  // ============ Report Generator 报告（Markdown 字符串） ============
  // 简易 Markdown → HTML，仅支持标题/列表/加粗/行内代码/代码块/引用，不引入外部库。
  function inlineMd(s) {
    s = escapeHtml(s);
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }

  function markdownToHtml(md) {
    if (!md) return '<p class="agent-output__empty">暂无报告内容</p>';
    var lines = String(md).split(/\r?\n/);
    var out = [];
    var inCode = false;
    var inList = false;

    function closeList() { if (inList) { out.push("</ul>"); inList = false; } }

    lines.forEach(function (line) {
      if (/^```/.test(line)) {
        if (inCode) { out.push("</code></pre>"); inCode = false; }
        else { closeList(); out.push('<pre class="md-code"><code>'); inCode = true; }
        return;
      }
      if (inCode) { out.push(escapeHtml(line)); return; }

      var h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        closeList();
        var lv = h[1].length;
        out.push("<h" + lv + ">" + inlineMd(h[2]) + "</h" + lv + ">");
        return;
      }
      var bq = line.match(/^>\s?(.*)$/);
      if (bq) {
        closeList();
        out.push("<blockquote>" + inlineMd(bq[1]) + "</blockquote>");
        return;
      }
      var li = line.match(/^[-*+]\s+(.*)$/);
      if (li) {
        if (!inList) { out.push("<ul>"); inList = true; }
        out.push("<li>" + inlineMd(li[1]) + "</li>");
        return;
      }
      if (!line.trim()) { closeList(); return; }
      closeList();
      out.push("<p>" + inlineMd(line) + "</p>");
    });
    closeList();
    if (inCode) out.push("</code></pre>");
    return out.join("\n");
  }

  function renderReport(md) {
    return '<div class="agent-output agent-output--md" data-step="report_generator">' + markdownToHtml(md) + '</div>';
  }

  // ============ 主入口 ============
  function renderAgentOutput(stepKey, output) {
    if (output == null) {
      return '<div class="agent-output"><p class="agent-output__empty">该步骤暂无产物</p></div>';
    }
    // report_generator 的产物是 Markdown 字符串
    if (stepKey === "report_generator") {
      return renderReport(output);
    }
    try {
      switch (stepKey) {
        case "planner": return renderPlanner(output);
        case "copywriter": return renderCopywriter(output);
        case "scriptwriter": return renderScriptwriter(output);
        case "visual_designer": return renderVisualDesigner(output);
        case "distributor": return renderDistributor(output);
        default:
          return '<pre class="agent-output__fallback">' + escapeHtml(JSON.stringify(output, null, 2)) + '</pre>';
      }
    } catch (e) {
      return '<pre class="agent-output__fallback">' + escapeHtml(JSON.stringify(output, null, 2)) + '</pre>';
    }
  }

  // ---------- 复制按钮：事件委托 ----------
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".copy-btn");
    if (!btn) return;
    var raw = btn.getAttribute("data-copy") || "";
    var text;
    try { text = decodeURIComponent(raw); } catch (_) { text = raw; }
    function done() {
      var orig = btn.textContent;
      btn.textContent = "已复制";
      btn.classList.add("is-copied");
      setTimeout(function () { btn.textContent = orig; btn.classList.remove("is-copied"); }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { legacyCopy(text); done(); });
    } else {
      legacyCopy(text); done();
    }
  });

  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (_) {}
    document.body.removeChild(ta);
  }

  Q.agentRender = {
    renderAgentOutput: renderAgentOutput,
    markdownToHtml: markdownToHtml
  };
})(window.Qinghe);
