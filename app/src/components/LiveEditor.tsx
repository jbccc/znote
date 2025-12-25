import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { Block } from "../lib/app-types";

function renderFormattedMarkdown(text: string): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^(\*\*|__)(.+?)\1/);
    if (boldMatch) {
      result.push(<strong key={key++}>{renderFormattedMarkdown(boldMatch[2])}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    const italicMatch = remaining.match(/^(\*|_)(.+?)\1/);
    if (italicMatch) {
      result.push(<em key={key++}>{renderFormattedMarkdown(italicMatch[2])}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      result.push(
        <code key={key++} className="bg-foreground/10 px-1 rounded text-[0.9em]">
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    const nextSpecial = remaining.search(/[\*_`]/);
    if (nextSpecial === -1) {
      result.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      result.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      result.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return result;
}

function renderFormattedLine(text: string): React.ReactNode {
  const todoMatch = text.match(/^(\s*)- \[([ x])\] (.*)$/);
  if (todoMatch) {
    return null;
  }

  const timeMatch = text.match(/^(\s*)- \[(\d{1,2}:\d{2})\] (.*)$/);
  if (timeMatch) {
    const [, indent, time, content] = timeMatch;
    return (
      <span style={{ paddingLeft: indent.length * 8 }} className="inline-flex items-start gap-2">
        <span className="text-foreground/40 select-none">•</span>
        <span className="text-foreground/50">[{time}]</span>
        <span>{renderFormattedMarkdown(content)}</span>
      </span>
    );
  }

  const bulletMatch = text.match(/^(\s*)- (.*)$/);
  if (bulletMatch) {
    const [, indent, content] = bulletMatch;
    return (
      <span style={{ paddingLeft: indent.length * 8 }} className="inline-flex items-start gap-2">
        <span className="text-foreground/40 select-none">•</span>
        <span>{renderFormattedMarkdown(content)}</span>
      </span>
    );
  }

  const numberMatch = text.match(/^(\s*)(\d+)\. (.*)$/);
  if (numberMatch) {
    const [, indent, num, content] = numberMatch;
    return (
      <span style={{ paddingLeft: indent.length * 8 }} className="inline-flex items-start gap-2">
        <span className="text-foreground/40 select-none min-w-[1.5em] text-right">{num}.</span>
        <span>{renderFormattedMarkdown(content)}</span>
      </span>
    );
  }

  return <span>{renderFormattedMarkdown(text)}</span>;
}

export interface LiveEditorHandle {
  focus: () => void;
  setSelectionRange: (start: number, end: number) => void;
}

interface LiveEditorProps {
  blocks: Block[];
  onChange: (text: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
}

export const LiveEditor = forwardRef<LiveEditorHandle, LiveEditorProps>(
  function LiveEditor({ blocks, onChange, onKeyDown, placeholder = "start logging..." }, ref) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const [cursorLine, setCursorLine] = useState(-1);
    const [isFocused, setIsFocused] = useState(false);

    const text = blocks.map((b) => b.text).join("\n");
    const lines = text ? text.split("\n") : [];

    useImperativeHandle(ref, () => ({
      focus: () => {
        textareaRef.current?.focus();
        const len = textareaRef.current?.value.length || 0;
        textareaRef.current?.setSelectionRange(len, len);
      },
      setSelectionRange: (start: number, end: number) => {
        textareaRef.current?.setSelectionRange(start, end);
      }
    }));

    const updateCursorLine = () => {
      if (!textareaRef.current) return;
      const pos = textareaRef.current.selectionStart;
      const textBeforeCursor = text.slice(0, pos);
      const lineNumber = textBeforeCursor.split("\n").length - 1;
      setCursorLine(lineNumber);
    };

    const handleScroll = () => {
      if (textareaRef.current && overlayRef.current) {
        overlayRef.current.scrollTop = textareaRef.current.scrollTop;
        overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
      }
    };

    useEffect(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
      }
    }, [text]);

    useEffect(() => {
      updateCursorLine();
    }, [text]);

    const handleContainerClick = (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && textareaRef.current) {
        textareaRef.current.focus();
        const len = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(len, len);
        updateCursorLine();
      }
    };

    return (
      <div className="relative min-h-[1.5em] cursor-text" onClick={handleContainerClick}>
        <div
          ref={overlayRef}
          className="text-sm leading-relaxed font-mono pointer-events-none whitespace-pre-wrap break-words"
          aria-hidden="true"
        >
          {lines.length > 0 ? (
            lines.map((line, i) => (
              <div key={i} className="min-h-[1.5em]">
                {isFocused && i === cursorLine ? (
                  line || "\u00A0"
                ) : (
                  line ? renderFormattedLine(line) : "\u00A0"
                )}
              </div>
            ))
          ) : (
            <div className="text-foreground/20">{placeholder}</div>
          )}
        </div>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            const scrollY = window.scrollY;
            onChange(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
            updateCursorLine();
            requestAnimationFrame(() => {
              window.scrollTo(window.scrollX, scrollY);
            });
          }}
          onKeyDown={(e) => {
            onKeyDown?.(e);
            requestAnimationFrame(updateCursorLine);
          }}
          onMouseUp={updateCursorLine}
          onFocus={() => {
            setIsFocused(true);
            updateCursorLine();
          }}
          onBlur={() => {
            setIsFocused(false);
            setCursorLine(-1);
          }}
          onScroll={handleScroll}
          placeholder=""
          className="absolute inset-0 z-10 w-full bg-transparent resize-none outline-none text-sm leading-relaxed font-mono overflow-hidden text-transparent caret-foreground selection:bg-foreground/20"
          spellCheck={false}
          rows={1}
          style={{ minHeight: "1.5em" }}
        />
      </div>
    );
  }
);
