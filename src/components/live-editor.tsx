"use client";

import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { Block } from "@/lib/types";

// Render with markdown syntax hidden - only styled content shown
function renderFormattedMarkdown(text: string): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold **text** or __text__
    const boldMatch = remaining.match(/^(\*\*|__)(.+?)\1/);
    if (boldMatch) {
      result.push(<strong key={key++}>{renderFormattedMarkdown(boldMatch[2])}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic *text* or _text_
    const italicMatch = remaining.match(/^(\*|_)(.+?)\1/);
    if (italicMatch) {
      result.push(<em key={key++}>{renderFormattedMarkdown(italicMatch[2])}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Code `text`
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

    // Find next special char
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

// Render a line with formatting (syntax hidden)
function renderFormattedLine(text: string): React.ReactNode {
  // Todo item - [ ] or - [x] - hide these lines
  const todoMatch = text.match(/^(\s*)- \[([ x])\] (.*)$/);
  if (todoMatch) {
    return null;
  }

  // Time tag with bullet - [HH:MM]
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

  // Bullet list - item
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

  // Numbered list 1. item
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

// Render a line as raw text (for the line being edited)
function renderRawLine(text: string): React.ReactNode {
  return <span>{text}</span>;
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

    // Calculate which line the cursor is on
    const updateCursorLine = () => {
      if (!textareaRef.current) return;
      const pos = textareaRef.current.selectionStart;
      const textBeforeCursor = text.slice(0, pos);
      const lineNumber = textBeforeCursor.split("\n").length - 1;
      setCursorLine(lineNumber);
    };

    // Sync scroll between textarea and overlay
    const handleScroll = () => {
      if (textareaRef.current && overlayRef.current) {
        overlayRef.current.scrollTop = textareaRef.current.scrollTop;
        overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
      }
    };

    // Auto-resize textarea
    useEffect(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
      }
    }, [text]);

    // Update cursor line on text change
    useEffect(() => {
      updateCursorLine();
    }, [text]);

    // Click on empty area below text to focus at end
    const handleContainerClick = (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && textareaRef.current) {
        textareaRef.current.focus();
        const len = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(len, len);
        updateCursorLine();
      }
    };

    return (
      <div
        className="relative min-h-[1.5em] cursor-text"
        onClick={handleContainerClick}
      >
        {/* Rendered overlay - shows formatted markdown, raw text for current line */}
        <div
          ref={overlayRef}
          className="text-sm leading-relaxed font-mono pointer-events-none whitespace-pre-wrap break-words"
          aria-hidden="true"
        >
          {lines.length > 0 ? (
            lines.map((line, i) => (
              <div key={i} className="min-h-[1.5em]">
                {isFocused && i === cursorLine ? (
                  // Current line: show raw text
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

        {/* Textarea for input - transparent text, visible caret */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            // Save scroll position before update
            const scrollY = window.scrollY;
            onChange(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
            updateCursorLine();
            // Restore scroll position
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
