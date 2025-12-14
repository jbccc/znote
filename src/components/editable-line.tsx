"use client";

import { useRef, useEffect, KeyboardEvent } from "react";
import { Block } from "@/lib/types";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else if (diffDays === 1) {
    return "yesterday";
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  } else {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
}

function renderMarkdown(text: string): string {
  let result = text
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>");

  return result;
}

interface EditableLineProps {
  block: Block;
  onChange: (text: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>, block: Block) => void;
  onFocus: () => void;
  isFocused: boolean;
}

export function EditableLine({ block, onChange, onKeyDown, onFocus, isFocused }: EditableLineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const text = block.text;

  // Check list types
  const todoMatch = text.match(/^(\s*)- \[([ x])\] (.*)$/);
  const bulletMatch = !todoMatch && text.match(/^(\s*)- (.*)$/);
  const numberMatch = !todoMatch && !bulletMatch && text.match(/^(\s*)(\d+)\. (.*)$/);

  useEffect(() => {
    if (ref.current && isFocused) {
      ref.current.focus();
      // Move cursor to end
      const range = document.createRange();
      const sel = window.getSelection();
      if (ref.current.childNodes.length > 0) {
        range.selectNodeContents(ref.current);
        range.collapse(false);
      } else {
        range.setStart(ref.current, 0);
        range.collapse(true);
      }
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [isFocused]);

  const handleInput = () => {
    if (ref.current) {
      const newText = ref.current.innerText;
      onChange(newText);
    }
  };

  const getContent = () => {
    if (todoMatch) {
      const [, , checked, content] = todoMatch;
      return renderMarkdown(content);
    }
    if (bulletMatch) {
      return renderMarkdown(bulletMatch[2]);
    }
    if (numberMatch) {
      return renderMarkdown(numberMatch[3]);
    }
    return renderMarkdown(text);
  };

  const getPrefix = () => {
    if (todoMatch) {
      const checked = todoMatch[2] === "x";
      return <span className="text-foreground/40 select-none mr-2">{checked ? "☑" : "☐"}</span>;
    }
    if (bulletMatch) {
      return <span className="text-foreground/40 select-none mr-2">•</span>;
    }
    if (numberMatch) {
      return <span className="text-foreground/40 select-none mr-2 min-w-[1.5em] text-right inline-block">{numberMatch[2]}.</span>;
    }
    return null;
  };

  const getIndent = () => {
    if (todoMatch) return todoMatch[1].length * 8;
    if (bulletMatch) return bulletMatch[1].length * 8;
    if (numberMatch) return numberMatch[1].length * 8;
    return 0;
  };

  const isChecked = todoMatch && todoMatch[2] === "x";

  // Empty line
  if (!text.trim()) {
    return (
      <div className="group flex items-start min-h-[1.5em]">
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={(e) => onKeyDown(e, block)}
          onFocus={onFocus}
          className="flex-1 outline-none"
          data-placeholder=""
        />
      </div>
    );
  }

  // Render with prefix for lists, or plain for regular text
  if (todoMatch || bulletMatch || numberMatch) {
    return (
      <div className="group flex items-start" style={{ paddingLeft: getIndent() }}>
        {getPrefix()}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={(e) => onKeyDown(e, block)}
          onFocus={onFocus}
          className={`flex-1 outline-none ${isChecked ? "line-through text-foreground/40" : ""}`}
          dangerouslySetInnerHTML={{ __html: getContent() }}
        />
        <span className="ml-auto text-[10px] text-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pl-4">
          {formatDate(block.createdAt)}
        </span>
      </div>
    );
  }

  return (
    <div className="group flex items-start">
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={(e) => onKeyDown(e, block)}
        onFocus={onFocus}
        className="flex-1 outline-none"
        dangerouslySetInnerHTML={{ __html: getContent() }}
      />
      <span className="ml-auto text-[10px] text-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pl-4">
        {formatDate(block.createdAt)}
      </span>
    </div>
  );
}
