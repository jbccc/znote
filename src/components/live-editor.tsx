"use client";

import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { Block } from "@/lib/types";

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold **text** or __text__
    const boldMatch = remaining.match(/^(\*\*|__)(.+?)\1/);
    if (boldMatch) {
      result.push(<strong key={key++}>{renderInlineMarkdown(boldMatch[2])}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic *text* or _text_
    const italicMatch = remaining.match(/^(\*|_)(.+?)\1/);
    if (italicMatch) {
      result.push(<em key={key++}>{renderInlineMarkdown(italicMatch[2])}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Find next special char
    const nextSpecial = remaining.search(/[\*_]/);
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

function renderLine(text: string): React.ReactNode {
  // Todo item - [ ] or - [x] - hide these lines (strikethrough style)
  const todoMatch = text.match(/^(\s*)- \[([ x])\] (.*)$/);
  if (todoMatch) {
    return null;
  }

  // Time tag with bullet - [HH:MM] (check before regular bullet)
  const timeMatch = text.match(/^(\s*)- \[(\d{1,2}:\d{2})\] (.*)$/);
  if (timeMatch) {
    const [, indent, time, content] = timeMatch;
    return (
      <span style={{ paddingLeft: indent.length * 8 }} className="inline-flex items-start gap-2">
        <span className="text-foreground/40 select-none">•</span>
        <span className="text-foreground/50">[{time}]</span>
        <span>{renderInlineMarkdown(content)}</span>
      </span>
    );
  }

  // Bullet list - item
  const bulletMatch = text.match(/^(\s*)- (.*)$/);
  if (bulletMatch) {
    const [, indent, content] = bulletMatch;
    return (
      <span style={{ paddingLeft: indent.length * 8 }} className="inline-flex items-start gap-2">
        <span className="text-foreground/40 select-none">•</span>
        <span>{renderInlineMarkdown(content)}</span>
      </span>
    );
  }

  // Numbered list 1. item
  const numberMatch = text.match(/^(\s*)(\d+)\. (.*)$/);
  if (numberMatch) {
    const [, indent, num, content] = numberMatch;
    return (
      <span style={{ paddingLeft: indent.length * 8 }} className="inline-flex items-start gap-2">
        <span className="text-foreground/40 select-none min-w-[1.5em] text-right">{num}.</span>
        <span>{renderInlineMarkdown(content)}</span>
      </span>
    );
  }

  return <span>{renderInlineMarkdown(text)}</span>;
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

    // Auto-resize textarea
    useEffect(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
      }
    }, [text, isFocused]);

    const handleFocus = () => {
      setIsFocused(true);
      // Ensure textarea is properly sized after focus
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
          textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
        }
      });
    };

    const handleBlur = () => {
      setIsFocused(false);
    };

    const handlePreviewClick = (e: React.MouseEvent) => {
      setIsFocused(true);
      // Focus textarea after state update
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          // Move cursor to end
          const len = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(len, len);
        }
      });
    };

    return (
      <div className="relative min-h-[1.5em]">
        {/* Always render textarea, but hide when showing preview */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            onChange(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
          }}
          onKeyDown={onKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={`w-full bg-transparent resize-none outline-none text-sm leading-relaxed placeholder:text-foreground/20 font-mono overflow-hidden ${
            !isFocused && lines.length > 0 ? "absolute opacity-0 pointer-events-none" : ""
          }`}
          spellCheck={false}
          rows={1}
          style={{ minHeight: "1.5em" }}
        />

        {/* Preview overlay - shown when not focused and has content */}
        {!isFocused && lines.length > 0 && (
          <div
            onClick={handlePreviewClick}
            className="text-sm leading-relaxed font-mono cursor-text"
          >
            {lines.map((line, i) => (
              <div key={i} className="min-h-[1.5em]">
                {line ? renderLine(line) : "\u00A0"}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
);
