import { useEffect, useRef, useState, useCallback } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import {
  Block,
  TomorrowTask,
  Settings,
  DEFAULT_SETTINGS,
  generateId,
  getLogicalDay,
  getTomorrowDay,
  isToday,
  parseTimeTag,
} from "./lib/app-types";
import { syncEngine } from "./lib/sync";
import { SettingsButton, loadSettings, saveSettings } from "./components/Settings";
import { TomorrowTasks } from "./components/TomorrowTasks";
import { MarkdownLine } from "./components/MarkdownLine";
import { LiveEditor, LiveEditorHandle } from "./components/LiveEditor";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const LOCAL_STORAGE_KEY = "znote-content";
const LAST_TOMORROW_CHECK_KEY = "znote-last-tomorrow-check";

function NoteEditor() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [tomorrowTasks, setTomorrowTasks] = useState<TomorrowTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "error" | "offline">("idle");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const editorRef = useRef<LiveEditorHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize
  useEffect(() => {
    setSettings(loadSettings());
    setIsLoggedIn(syncEngine.isLoggedIn());

    const unsubscribe = syncEngine.subscribe((event, data) => {
      if (event === "status-change") {
        setSyncStatus(data as typeof syncStatus);
      }
      if (event === "blocks-updated") {
        const syncBlocks = data as Block[];
        setBlocks(syncBlocks);
      }
      if (event === "tomorrow-tasks-updated") {
        const syncTasks = data as TomorrowTask[];
        setTomorrowTasks(syncTasks);
      }
    });

    // Initialize sync engine
    syncEngine.initialize().then(() => {
      setIsLoggedIn(syncEngine.isLoggedIn());
      if (syncEngine.isLoggedIn()) {
        setBlocks(syncEngine.getBlocks() as Block[]);
        setTomorrowTasks(syncEngine.getTomorrowTasks() as TomorrowTask[]);
      } else {
        // Load from local storage
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          try {
            const data = JSON.parse(saved);
            setBlocks(data.blocks || []);
            setTomorrowTasks(data.tomorrowTasks || []);
          } catch {
            setBlocks([]);
          }
        }
      }
      setLoaded(true);
    });

    return () => unsubscribe();
  }, []);

  // Theme
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

  // Scroll to bottom on load
  useEffect(() => {
    if (loaded) {
      editorRef.current?.focus();
      window.scrollTo(0, document.body.scrollHeight);
    }
  }, [loaded]);

  const handleSettingsChange = (newSettings: Settings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const handleSignIn = async (credential: string) => {
    try {
      await syncEngine.signIn(credential);
      setIsLoggedIn(true);
      setBlocks(syncEngine.getBlocks() as Block[]);
      setTomorrowTasks(syncEngine.getTomorrowTasks() as TomorrowTask[]);
    } catch (error) {
      console.error("Sign in failed:", error);
    }
  };

  const handleSignOut = () => {
    syncEngine.signOut();
    setIsLoggedIn(false);
  };

  const saveData = useCallback((newBlocks: Block[], newTasks: TomorrowTask[]) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (isLoggedIn) {
        // Save via sync engine
        for (const block of newBlocks) {
          syncEngine.saveBlock({
            id: block.id,
            text: block.text,
            createdAt: block.createdAt,
            calendarEventId: block.calendarEventId || null,
            position: 0,
            version: block.version || 1,
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          });
        }
      } else {
        // Save to local storage
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
          blocks: newBlocks,
          tomorrowTasks: newTasks,
        }));
      }
    }, 500);
  }, [isLoggedIn]);

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

    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const before = value.slice(0, selectionStart);
      const after = value.slice(selectionEnd);
      const newValue = before + "\n" + after;
      handleTextChange(newValue);
      requestAnimationFrame(() => {
        textarea.setSelectionRange(selectionStart + 1, selectionStart + 1);
      });
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const currentLine = value.slice(lineStart, selectionStart);

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
          const newValue = value.slice(0, lineStart) + after;
          handleTextChange(newValue);
          requestAnimationFrame(() => {
            textarea.setSelectionRange(lineStart, lineStart);
          });
        } else {
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
    const now = new Date().toISOString();

    const newTodayBlocks: Block[] = [];
    let oldIndex = 0;

    for (let i = 0; i < newLines.length; i++) {
      const newLine = newLines[i];

      if (oldIndex < todayBlocks.length && todayBlocks[oldIndex].text === newLine) {
        newTodayBlocks.push(todayBlocks[oldIndex]);
        oldIndex++;
      } else if (oldIndex < todayBlocks.length && i < todayBlocks.length && newLine !== todayBlocks[i].text) {
        newTodayBlocks.push({ ...todayBlocks[i], text: newLine });
        if (i === oldIndex) oldIndex++;
      } else {
        newTodayBlocks.push({ id: generateId(), text: newLine, createdAt: now });
      }
    }

    const pastBlocks = getPastBlocks();
    const allBlocks = [...pastBlocks, ...newTodayBlocks];
    setBlocks(allBlocks);
    saveData(allBlocks, tomorrowTasks);
  };

  const handleTomorrowTasksChange = (newTasks: TomorrowTask[]) => {
    setTomorrowTasks(newTasks);
    saveData(blocks, newTasks);
  };

  if (!loaded) {
    return <div className="text-foreground/20 text-sm">loading...</div>;
  }

  const dayGroups = groupBlocksByDay();

  const handleContainerClick = (e: React.MouseEvent) => {
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
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          settings={settings}
          onSettingsChange={handleSettingsChange}
          syncStatus={syncStatus}
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

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <main className="min-h-screen p-4 md:p-8 max-w-3xl mx-auto">
        <NoteEditor />
      </main>
    </GoogleOAuthProvider>
  );
}
