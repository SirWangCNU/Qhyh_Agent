/**
 * 轻量 Markdown 渲染器。
 *
 * 对话创作 Agent 返回的最终答案是中文 Markdown（## 标题、- 列表、| 表格、
 * **粗体** 等）。本组件不引入 react-markdown 依赖，用轻量行解析器覆盖
 * 农业短视频方案里的高频格式，并保证文本完整显示、不截断。
 *
 * 支持：
 *   标题 # ## ###
 *   无序/有序列表（可嵌套一级缩进）
 *   表格（支持表头对齐行 |---|---|）
 *   粗体 ** 、斜体 * 、行内代码 ``
 *   分隔线 ---
 *   段落
 */

import { cn } from "@/lib/utils";

interface MarkdownRendererProps {
  source: string;
  className?: string;
}

/** 行内格式解析：粗体、斜体、行内代码。 */
function parseInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let idx = 0;

  const push = (node: React.ReactNode) => {
    nodes.push(<span key={`${keyPrefix}-${idx++}`}>{node}</span>);
  };

  while (remaining.length > 0) {
    // 行内代码 ``
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      push(
        <code
          key={`${keyPrefix}-code-${idx}`}
          className="rounded bg-ink/5 px-1 py-0.5 font-mono text-[0.9em] text-ink-soft"
        >
          {codeMatch[1]}
        </code>,
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // 粗体 **text**
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      push(
        <strong
          key={`${keyPrefix}-b-${idx}`}
          className="font-semibold text-ink"
        >
          {parseInline(boldMatch[1], `${keyPrefix}-b-${idx}`)}
        </strong>,
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // 斜体 *text*（避免匹配 **）
    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      push(
        <em
          key={`${keyPrefix}-i-${idx}`}
          className="italic text-ink-soft"
        >
          {parseInline(italicMatch[1], `${keyPrefix}-i-${idx}`)}
        </em>,
      );
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // 普通文本：取到下一个特殊标记前
    const nextSpecial = remaining.search(/[`\*]/);
    if (nextSpecial === -1) {
      push(remaining);
      break;
    }
    if (nextSpecial > 0) {
      push(remaining.slice(0, nextSpecial));
    }
    remaining = remaining.slice(nextSpecial);
  }

  return nodes;
}

/** 判断行是否为分隔线。 */
function isHr(line: string) {
  return /^-{3,}\s*$/.test(line.trim());
}

/** 解析表格。 */
function parseTable(lines: string[], startIdx: number): [React.ReactNode, number] {
  let end = startIdx;
  while (end < lines.length && lines[end].trim().includes("|")) {
    end++;
  }
  const rawRows = lines.slice(startIdx, end);
  // 过滤对齐行 |---|---|
  const rows = rawRows.filter((r) => !/^\s*\|[-:\s|]*\|\s*$/.test(r));
  const cells = rows.map((r) =>
    r
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0),
  );
  const [head, ...body] = cells;

  const cellClass =
    "border-b border-border px-3 py-2 text-left text-sm leading-relaxed";

  return [
    <div key={`table-${startIdx}`} className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-ink/[0.03]">
            {head?.map((h, i) => (
              <th key={i} className={cellClass}>
                {parseInline(h, `th-${startIdx}-${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="hover:bg-ink/[0.02]">
              {row.map((c, ci) => (
                <td key={ci} className={cellClass}>
                  {parseInline(c, `td-${startIdx}-${ri}-${ci}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>,
    end,
  ];
}

export function MarkdownRenderer({ source, className }: MarkdownRendererProps) {
  const lines = source.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let blockIdx = 0;

  const pushBlock = (node: React.ReactNode) => {
    blocks.push(
      <div key={`block-${blockIdx++}`} className="mb-1 last:mb-0">
        {node}
      </div>,
    );
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.replace(/\r$/, "");

    if (line.trim() === "") {
      i++;
      continue;
    }

    // 分隔线
    if (isHr(line)) {
      pushBlock(<hr className="my-4 border-t border-border" />);
      i++;
      continue;
    }

    // 标题
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const sizeClass =
        level === 1
          ? "text-lg font-semibold"
          : level === 2
            ? "text-base font-semibold"
            : "text-sm font-semibold";
      pushBlock(
        <div className={cn("mt-4 mb-1 text-ink", sizeClass)}>
          <span className="mr-2 text-accent">{"#".repeat(level)}</span>
          {parseInline(text, `h-${i}`)}
        </div>,
      );
      i++;
      continue;
    }

    // 无序列表
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      pushBlock(
        <ul className="my-2 space-y-1 pl-1">
          {items.map((item, li) => (
            <li key={li} className="flex items-start gap-2 text-sm leading-relaxed">
              <span
                className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent"
                aria-hidden="true"
              />
              <span className="text-ink-soft">
                {parseInline(item, `ul-${blockIdx}-${li}`)}
              </span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // 有序列表
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      pushBlock(
        <ol className="my-2 list-none space-y-1 pl-1">
          {items.map((item, li) => (
            <li key={li} className="flex items-start gap-2 text-sm leading-relaxed">
              <span className="mt-0.5 min-w-[1.25rem] text-xs font-medium text-accent">
                {li + 1}.
              </span>
              <span className="text-ink-soft">
                {parseInline(item, `ol-${blockIdx}-${li}`)}
              </span>
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // 表格
    if (line.includes("|") && lines.slice(i, i + 2).some((l) => l.includes("|"))) {
      const [tableNode, nextIdx] = parseTable(lines, i);
      pushBlock(tableNode);
      i = nextIdx;
      continue;
    }

    // 段落（合并连续非空行）
    const paraLines: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "") {
      paraLines.push(lines[i]);
      i++;
    }
    pushBlock(
      <p className="my-2 text-sm leading-relaxed text-ink-soft">
        {parseInline(paraLines.join(" "), `p-${blockIdx}`)}
      </p>,
    );
  }

  return (
    <div className={cn("markdown-body", className)}>
      {blocks.length > 0 ? blocks : null}
    </div>
  );
}
