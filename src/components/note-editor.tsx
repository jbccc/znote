"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Block,
  NoteData,
  Settings,
  TomorrowTask,
  DEFAULT_SETTINGS,
  generateId,
  parseNoteData,
  serializeNoteData,
  getLogicalDay,
  getTomorrowDay,
  isToday,
  parseTimeTag,
} from "@/lib/types";
import { SettingsButton, loadSettings, saveSettings } from "./settings";
import { TomorrowTasks } from "./tomorrow-tasks";
import { MarkdownLine } from "./markdown-line";
import { LiveEditor, LiveEditorHandle } from "./live-editor";
import { useCalendarSync } from "@/hooks/use-calendar-sync";

const LOCAL_STORAGE_KEY = "znote-content";
const LAST_TOMORROW_CHECK_KEY = "znote-last-tomorrow-check";

interface NoteEditorProps {
  isLoggedIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

export function NoteEditor({ isLoggedIn, onSignIn, onSignOut }: NoteEditorProps) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [tomorrowTasks, setTomorrowTasks] = useState<TomorrowTask[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const editorRef = useRef<LiveEditorHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousBlocksRef = useRef<Map<string, Block>>(new Map());
  const calendarSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Calendar sync callback
  const handleCalendarBlockUpdate = useCallback((blockId: string, calendarEventId: string | undefined) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, calendarEventId } : b))
    );
  }, []);

  const { syncBlock, deleteEvent } = useCalendarSync({
    enabled: isLoggedIn,
    onBlockUpdate: handleCalendarBlockUpdate,
  });

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
    } else if (settings.theme === "light") {
      root.classList.add("light");
      root.classList.remove("dark");
    } else {
      root.classList.remove("dark", "light");
    }
  }, [settings.theme]);

  const convertTomorrowTasksToBlocks = (
    data: NoteData,
    dayCutHour: number
  ): { blocks: Block[]; tomorrowTasks: TomorrowTask[]; changed: boolean } => {
    const tasks = data.tomorrowTasks || [];
    if (tasks.length === 0) {
      return { blocks: data.blocks, tomorrowTasks: [], changed: false };
    }

    const lastCheck = localStorage.getItem(LAST_TOMORROW_CHECK_KEY);
    const todayKey = getLogicalDay(new Date().toISOString(), dayCutHour);

    if (lastCheck === todayKey) {
      return { blocks: data.blocks, tomorrowTasks: tasks, changed: false };
    }

    localStorage.setItem(LAST_TOMORROW_CHECK_KEY, todayKey);

    const now = new Date().toISOString();
    const newBlocks: Block[] = tasks
      .filter((t) => t.text.trim())
      .map((t) => ({
        id: generateId(),
        text: t.time ? `- [${t.time}] ${t.text}` : `- ${t.text}`,
        createdAt: now,
      }));

    return {
      blocks: [...data.blocks, ...newBlocks],
      tomorrowTasks: [],
      changed: newBlocks.length > 0,
    };
  };

  useEffect(() => {
    const currentSettings = loadSettings();

    if (isLoggedIn) {
      fetch("/api/note")
        .then((res) => res.json())
        .then((data) => {
          const serverData = parseNoteData(data.content || "");
          const localContent = localStorage.getItem(LOCAL_STORAGE_KEY);
          const localData = localContent ? parseNoteData(localContent) : { blocks: [] };

          let finalData: NoteData;
          if (localData.blocks.length > 0 && serverData.blocks.length === 0) {
            finalData = localData;
          } else {
            finalData = serverData;
          }

          const converted = convertTomorrowTasksToBlocks(finalData, currentSettings.dayCutHour);
          setBlocks(converted.blocks);
          setTomorrowTasks(converted.tomorrowTasks);

          if (converted.changed || (localData.blocks.length > 0 && serverData.blocks.length === 0)) {
            saveToServer({ blocks: converted.blocks, tomorrowTasks: converted.tomorrowTasks });
          }

          localStorage.removeItem(LOCAL_STORAGE_KEY);
          setLoaded(true);
        });
    } else {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY) || "";
      const data = parseNoteData(saved);
      const converted = convertTomorrowTasksToBlocks(data, currentSettings.dayCutHour);
      setBlocks(converted.blocks);
      setTomorrowTasks(converted.tomorrowTasks);

      if (converted.changed) {
        saveToLocal({ blocks: converted.blocks, tomorrowTasks: converted.tomorrowTasks });
      }

      setLoaded(true);
    }
  }, [isLoggedIn]);

  const handleSettingsChange = (newSettings: Settings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  // Track previous blocks for calendar sync
  useEffect(() => {
    const map = new Map<string, Block>();
    for (const block of blocks) {
      map.set(block.id, block);
    }
    previousBlocksRef.current = map;
  }, [blocks]);

  // Scroll to bottom and focus on load
  useEffect(() => {
    if (loaded) {
      editorRef.current?.focus();
      window.scrollTo(0, document.body.scrollHeight);
    }
  }, [loaded]);

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

  const groupBlocksByDay = () => {
    const groups: { day: string; blocks: Block[]; isCurrentDay: boolean }[] = [];
    let currentGroup: { day: string; blocks: Block[]; isCurrentDay: boolean } | null = null;

    for (const block of blocks) {
      const day = getLogicalDay(block.createdAt, settings.dayCutHour);
      const isCurrent = isToday(block.createdAt, settings.dayCutHour);

      if (!currentGroup || currentGroup.day !== day) {
        currentGroup = { day, blocks: [block], isCurrentDay: isCurrent };
        groups.push(currentGroup);
      } else {
        currentGroup.blocks.push(block);
      }
    }

    // Strip trailing empty lines from past days
    for (const group of groups) {
      if (!group.isCurrentDay) {
        while (group.blocks.length > 0 && !group.blocks[group.blocks.length - 1].text.trim()) {
          group.blocks.pop();
        }
      }
    }

    return groups;
  };

  const getTodayBlocks = () => blocks.filter((b) => isToday(b.createdAt, settings.dayCutHour));
  const getPastBlocks = () => blocks.filter((b) => !isToday(b.createdAt, settings.dayCutHour));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const { value, selectionStart, selectionEnd } = textarea;

    // Cmd+Enter = forced newline (no list continuation)
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const before = value.slice(0, selectionStart);
      const after = value.slice(selectionEnd);
      const newValue = before + "\n" + after;
      handleTextChange(newValue);
      // Set cursor position after React re-renders
      requestAnimationFrame(() => {
        textarea.setSelectionRange(selectionStart + 1, selectionStart + 1);
      });
      return;
    }

    // Regular Enter = list continuation
    if (e.key === "Enter" && !e.shiftKey) {
      const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const currentLine = value.slice(lineStart, selectionStart);

      // Check for list patterns
      const todoMatch = currentLine.match(/^(\s*)- \[([ x])\] (.*)$/);
      const bulletMatch = currentLine.match(/^(\s*)- (.*)$/);
      const numberMatch = currentLine.match(/^(\s*)(\d+)\. (.*)$/);

      let prefix = "";
      let isEmpty = false;

      if (todoMatch) {
        prefix = todoMatch[1] + "- [ ] ";
        isEmpty = !todoMatch[3].trim();
      } else if (bulletMatch) {
        prefix = bulletMatch[1] + "- ";
        isEmpty = !bulletMatch[2].trim();
      } else if (numberMatch) {
        const nextNum = parseInt(numberMatch[2]) + 1;
        prefix = numberMatch[1] + nextNum + ". ";
        isEmpty = !numberMatch[3].trim();
      }

      if (prefix) {
        e.preventDefault();
        const before = value.slice(0, selectionStart);
        const after = value.slice(selectionEnd);

        if (isEmpty) {
          // Empty list item - remove it and just add newline
          const newValue = value.slice(0, lineStart) + after;
          handleTextChange(newValue);
          requestAnimationFrame(() => {
            textarea.setSelectionRange(lineStart, lineStart);
          });
        } else {
          // Continue the list
          const newValue = before + "\n" + prefix + after;
          const newCursor = selectionStart + 1 + prefix.length;
          handleTextChange(newValue);
          requestAnimationFrame(() => {
            textarea.setSelectionRange(newCursor, newCursor);
          });
        }
      }
    }
  };

  const handleTextChange = (text: string) => {
    const newLines = text.split("\n");
    const todayBlocks = getTodayBlocks();
    const oldLines = todayBlocks.map((b) => b.text);
    const now = new Date().toISOString();

    const newTodayBlocks: Block[] = [];
    let oldIndex = 0;

    for (let i = 0; i < newLines.length; i++) {
      const newLine = newLines[i];

      if (oldIndex < oldLines.length && oldLines[oldIndex] === newLine) {
        newTodayBlocks.push(todayBlocks[oldIndex]);
        oldIndex++;
      } else if (oldIndex < oldLines.length && i < oldLines.length && newLine !== oldLines[i]) {
        newTodayBlocks.push({ ...todayBlocks[i], text: newLine });
        if (i === oldIndex) oldIndex++;
      } else {
        newTodayBlocks.push({ id: generateId(), text: newLine, createdAt: now });
      }
    }

    // Find deleted blocks and clean up their calendar events
    const newBlockIds = new Set(newTodayBlocks.map((b) => b.id));
    for (const oldBlock of todayBlocks) {
      if (!newBlockIds.has(oldBlock.id) && oldBlock.calendarEventId) {
        deleteEvent(oldBlock.calendarEventId);
      }
    }

    const pastBlocks = getPastBlocks();
    const allBlocks = [...pastBlocks, ...newTodayBlocks];
    setBlocks(allBlocks);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const data = { blocks: allBlocks, tomorrowTasks };
      if (isLoggedIn) {
        saveToServer(data);
      } else {
        saveToLocal(data);
      }
    }, 500);

    // Debounce calendar sync to avoid too many API calls while typing
    if (calendarSyncTimeoutRef.current) {
      clearTimeout(calendarSyncTimeoutRef.current);
    }

    calendarSyncTimeoutRef.current = setTimeout(() => {
      for (const block of newTodayBlocks) {
        const prevBlock = previousBlocksRef.current.get(block.id);
        if (parseTimeTag(block.text)) {
          syncBlock(block, prevBlock);
        } else if (prevBlock && prevBlock.calendarEventId && !parseTimeTag(block.text)) {
          // Time tag was removed
          syncBlock(block, prevBlock);
        }
      }
    }, 1500); // 1.5s debounce for calendar sync
  };

  const handleTomorrowTasksChange = (newTasks: TomorrowTask[]) => {
    setTomorrowTasks(newTasks);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const data = { blocks, tomorrowTasks: newTasks };
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

  const dayGroups = groupBlocksByDay();

  // Click on empty area to focus editor at end
  const handleContainerClick = (e: React.MouseEvent) => {
    // Only if clicking on the container itself (empty space)
    if (e.target === containerRef.current) {
      editorRef.current?.focus();
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative pb-[70vh] cursor-text"
      onClick={handleContainerClick}
    >
      <header className="sticky top-0 z-40 flex justify-between items-center py-4 md:py-8 text-xs text-foreground/40 bg-background opacity-0 hover:opacity-100 has-[:focus]:opacity-100 transition-opacity duration-300">
        <span>znote</span>
        <SettingsButton
          isLoggedIn={isLoggedIn}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
          settings={settings}
          onSettingsChange={handleSettingsChange}
        />
      </header>

      {dayGroups.map((group) => (
        <div key={group.day} className="mb-6">
          <div className="text-xs text-foreground/30 mb-2 font-mono">
            {group.day}
          </div>
          {group.isCurrentDay ? (
            <LiveEditor
              ref={editorRef}
              blocks={getTodayBlocks()}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder="start logging..."
            />
          ) : (
            <div className="text-sm leading-relaxed font-mono text-foreground/50">
              {group.blocks.map((block) => (
                <MarkdownLine key={block.id} block={block} />
              ))}
            </div>
          )}
        </div>
      ))}

      {!dayGroups.some((g) => g.isCurrentDay) && (
        <div className="mb-6">
          <div className="text-xs text-foreground/30 mb-2 font-mono">
            {getLogicalDay(new Date().toISOString(), settings.dayCutHour)}
          </div>
          <LiveEditor
            ref={editorRef}
            blocks={[]}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="start logging..."
          />
        </div>
      )}

      {saving && (
        <span className="fixed bottom-4 right-4 text-xs text-foreground/20">saving...</span>
      )}

      <div className="fixed bottom-0 left-0 right-0 p-4 md:p-8 bg-background opacity-0 hover:opacity-100 has-[:focus]:opacity-100 transition-opacity duration-300">
        <div className="max-w-3xl mx-auto">
          <div className="text-xs text-foreground/15 mb-1 font-mono">
            {getTomorrowDay(settings.dayCutHour)}
          </div>
          <div className="max-h-[30vh] overflow-y-auto">
            <TomorrowTasks tasks={tomorrowTasks} onChange={handleTomorrowTasksChange} />
          </div>
        </div>
      </div>
    </div>
  );
}
