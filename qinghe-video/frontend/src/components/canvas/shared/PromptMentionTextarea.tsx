/**
 * 支持 `@` 引用图片素材的提示词输入框。
 *
 * 实现：原生 Textarea + 手动定位的浮动候选项浮层。
 * - 输入 `@` 触发浮层，继续输入字符作为过滤词（仅匹配 `@` 之后到光标的文本）。
 * - 上下键移动高亮，Enter/Tab 选中，Esc/失焦关闭。
 * - 选中后把 `@query` 替换为候选项的 mention 占位符（如 `@图片一`）。
 *
 * 候选项来自当前画布的 referenceImage / image 节点（buildMentionCandidates）。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useCanvasStore } from "@/stores/canvas-store";
import {
  buildMentionCandidates,
  type MentionCandidate,
} from "@/components/canvas/shared/promptMention";
import { cn } from "@/lib/utils";

interface PromptMentionTextareaProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  className?: string;
  /** 是否禁用。 */
  disabled?: boolean;
}

/** 从光标位置往前找 `@` 触发点：返回 `@` 后的查询串与起始索引，无触发返回 null。 */
function detectMentionQuery(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  if (caret <= 0) return null;
  // 从光标往前扫，遇到空白/换行即止
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (/\s/.test(ch)) break;
    if (ch === "@") {
      // @ 必须在行首或前面是空白
      const prev = i > 0 ? text[i - 1] : "";
      if (prev === "" || /\s/.test(prev)) {
        return { start: i, query: text.slice(i + 1, caret) };
      }
      return null;
    }
    i -= 1;
  }
  return null;
}

export function PromptMentionTextarea({
  value,
  onChange,
  placeholder,
  className,
  disabled,
}: PromptMentionTextareaProps) {
  const nodes = useCanvasStore((s) => s.nodes);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [caret, setCaret] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [open, setOpen] = useState(false);

  const candidates = useMemo<MentionCandidate[]>(
    () => buildMentionCandidates(nodes),
    [nodes],
  );

  const trigger = useMemo(
    () => detectMentionQuery(value, caret),
    [value, caret],
  );

  const filtered = useMemo<MentionCandidate[]>(() => {
    if (!trigger) return [];
    const q = trigger.query;
    if (!q) return candidates;
    return candidates.filter(
      (c) =>
        c.display.includes(q) ||
        c.mention.includes(q) ||
        c.kind.includes(q),
    );
  }, [trigger, candidates]);

  // 开关浮层
  useEffect(() => {
    const shouldOpen = !!trigger && filtered.length > 0;
    setOpen(shouldOpen);
    if (shouldOpen) setActiveIdx(0);
  }, [trigger, filtered.length]);

  const syncCaret = () => {
    const el = textareaRef.current;
    if (!el) return;
    setCaret(el.selectionStart ?? 0);
  };

  const insertMention = (cand: MentionCandidate) => {
    if (!trigger) return;
    const before = value.slice(0, trigger.start);
    const after = value.slice(caret);
    const next = `${before}${cand.mention} ${after}`;
    onChange(next);
    setOpen(false);
    // 把光标放到插入文本之后
    const pos = before.length + cand.mention.length + 1;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % filtered.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      const cand = filtered[activeIdx];
      if (cand) {
        e.preventDefault();
        insertMention(cand);
        return;
      }
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          syncCaret();
        }}
        onKeyUp={syncCaret}
        onClick={syncCaret}
        onSelect={syncCaret}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className={cn("resize-none text-xs", className)}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover p-1 text-xs shadow-lg">
          {filtered.map((c, i) => (
            <button
              key={c.nodeId}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(c);
              }}
              onMouseEnter={() => setActiveIdx(i)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left",
                i === activeIdx ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
              )}
            >
              {c.imageUrl ? (
                <img
                  src={c.imageUrl}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded border object-cover"
                />
              ) : (
                <span className="h-8 w-8 shrink-0 rounded border bg-muted" />
              )}
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{c.display}</span>
                <span className="ml-1 text-muted-foreground">{c.mention}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
