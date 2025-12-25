export interface Block {
  id: string;
  text: string;
  createdAt: string;
  calendarEventId?: string;
  version?: number;
  updatedAt?: string;
  position?: number;
  syncStatus?: "synced" | "pending" | "conflict";
}

export interface TomorrowTask {
  id: string;
  text: string;
  time: string;
  version?: number;
  updatedAt?: string;
  position?: number;
  syncStatus?: "synced" | "pending" | "conflict";
}

export interface Settings {
  theme: "system" | "light" | "dark";
  dayCutHour: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  dayCutHour: 4,
};

export function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
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
