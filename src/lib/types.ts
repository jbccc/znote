export interface Block {
  id: string;
  text: string;
  createdAt: string;
  calendarEventId?: string;
  // Sync metadata (optional for backward compatibility)
  version?: number;
  updatedAt?: string;
  position?: number;
  syncStatus?: "synced" | "pending" | "conflict";
}

export interface TomorrowTask {
  id: string;
  text: string;
  time: string;
  // Sync metadata (optional for backward compatibility)
  version?: number;
  updatedAt?: string;
  position?: number;
  syncStatus?: "synced" | "pending" | "conflict";
}

export interface Settings {
  theme: "system" | "light" | "dark";
  dayCutHour: number; // 0-23, hour at which a new day starts
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  dayCutHour: 4, // 4am default
};

export interface NoteData {
  blocks: Block[];
  tomorrowTasks?: TomorrowTask[];
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function parseNoteData(content: string): NoteData {
  if (!content) return { blocks: [] };

  try {
    const parsed = JSON.parse(content);
    if (parsed.blocks) return parsed;
  } catch {
    // Legacy plain text - convert to blocks
    const lines = content.split("\n");
    return {
      blocks: lines.map((text) => ({
        id: generateId(),
        text,
        createdAt: new Date().toISOString(),
      })),
    };
  }

  return { blocks: [] };
}

export function serializeNoteData(data: NoteData): string {
  return JSON.stringify(data);
}

export function getLogicalDay(dateStr: string, dayCutHour: number): string {
  const date = new Date(dateStr);
  if (date.getHours() < dayCutHour) {
    date.setDate(date.getDate() - 1);
  }
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function isToday(dateStr: string, dayCutHour: number): boolean {
  const now = new Date();
  const adjustedNow = new Date(now);
  if (adjustedNow.getHours() < dayCutHour) {
    adjustedNow.setDate(adjustedNow.getDate() - 1);
  }
  const todayStr = adjustedNow.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return getLogicalDay(dateStr, dayCutHour) === todayStr;
}

export function getTomorrowDay(dayCutHour: number): string {
  const now = new Date();
  const adjusted = new Date(now);
  if (adjusted.getHours() < dayCutHour) {
    adjusted.setDate(adjusted.getDate() - 1);
  }
  adjusted.setDate(adjusted.getDate() + 1);
  return adjusted.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function parseTimeTag(text: string): { time: string; task: string } | null {
  const match = text.match(/^(?:\s*)-\s*\[(\d{1,2}:\d{2})\]\s*(.*)$/);
  if (match) {
    return { time: match[1], task: match[2] };
  }
  return null;
}
