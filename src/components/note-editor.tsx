"use client";

import { useEffect, useRef, useState } from "react";
import { Block, NoteData, generateId, parseNoteData, serializeNoteData } from "@/lib/types";
import { MarkdownLine } from "./markdown-line";

const LOCAL_STORAGE_KEY = "znote-content";

export function NoteEditor({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousLinesRef = useRef<string[]>([]);

  useEffect(() => {
    if (isLoggedIn) {
      fetch("/api/note")
        .then((res) => res.json())
        .then((data) => {
          const serverData = parseNoteData(data.content || "");
          const localContent = localStorage.getItem(LOCAL_STORAGE_KEY);
          const localData = localContent ? parseNoteData(localContent) : { blocks: [] };

          if (localData.blocks.length > 0 && serverData.blocks.length === 0) {
            setBlocks(localData.blocks);
            saveToServer(localData);
          } else {
            setBlocks(serverData.blocks);
          }
          localStorage.removeItem(LOCAL_STORAGE_KEY);
          setLoaded(true);
        });
    } else {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY) || "";
      const data = parseNoteData(saved);
      setBlocks(data.blocks);
      setLoaded(true);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    previousLinesRef.current = blocks.map((b) => b.text);
  }, [blocks]);

  // Auto-scroll to bottom and focus on load
  useEffect(() => {
    if (loaded && textareaRef.current) {
      scrollToBottom();
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [loaded]);

  const scrollToBottom = () => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
    window.scrollTo(0, document.body.scrollHeight);
  };

  const saveToServer = async (data: NoteData) => {
    setSaving(true);
    await fetch("/api/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: serializeNoteData(data) }),
    });
    setSaving(false);
  };

  const saveToLocal = (data: NoteData) => {
    localStorage.setItem(LOCAL_STORAGE_KEY, serializeNoteData(data));
  };

  const getTextContent = () => blocks.map((b) => b.text).join("\n");

  const handleTextChange = (text: string) => {
    const newLines = text.split("\n");
    const oldLines = previousLinesRef.current;
    const now = new Date().toISOString();

    const newBlocks: Block[] = [];
    let oldIndex = 0;

    for (let i = 0; i < newLines.length; i++) {
      const newLine = newLines[i];

      if (oldIndex < oldLines.length && oldLines[oldIndex] === newLine) {
        newBlocks.push(blocks[oldIndex]);
        oldIndex++;
      } else if (oldIndex < oldLines.length && i < oldLines.length && newLine !== oldLines[i]) {
        newBlocks.push({ ...blocks[i], text: newLine });
        if (i === oldIndex) oldIndex++;
      } else {
        newBlocks.push({ id: generateId(), text: newLine, createdAt: now });
      }
    }

    setBlocks(newBlocks);
    previousLinesRef.current = newLines;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const data = { blocks: newBlocks };
      if (isLoggedIn) {
        saveToServer(data);
      } else {
        saveToLocal(data);
      }
    }, 500);
  };

  if (!loaded) {
    return <div className="text-foreground/20 text-sm">loading...</div>;
  }

  return (
    <div ref={containerRef} className="relative min-h-[calc(100vh-8rem)]">
      <textarea
        ref={textareaRef}
        value={getTextContent()}
        onChange={(e) => handleTextChange(e.target.value)}
        placeholder="start logging..."
        className="w-full min-h-[calc(100vh-8rem)] bg-transparent resize-none outline-none text-sm leading-relaxed placeholder:text-foreground/20 font-mono"
        spellCheck={false}
      />
      {saving && (
        <span className="fixed bottom-4 right-4 text-xs text-foreground/20">saving...</span>
      )}
    </div>
  );
}
