// Shared types for sync between client and server

export interface SyncBlock {
  id: string;
  text: string;
  createdAt: string;
  calendarEventId: string | null;
  position: number;
  version: number;
  updatedAt: string;
  deletedAt: string | null;
  clientId?: string;
}

export interface SyncTomorrowTask {
  id: string;
  text: string;
  time: string | null;
  position: number;
  version: number;
  updatedAt: string;
  deletedAt: string | null;
  clientId?: string;
}

export interface SyncSettings {
  theme: "system" | "light" | "dark";
  dayCutHour: number;
  updatedAt: string;
}

export interface PushPayload {
  blocks?: SyncBlock[];
  tomorrowTasks?: SyncTomorrowTask[];
  settings?: SyncSettings | null;
  clientId: string;
}

export interface PushResponse {
  success: boolean;
  applied: {
    blocks: string[];
    tomorrowTasks: string[];
    settings: boolean;
  };
  conflicts: Array<{
    type: "block" | "tomorrowTask";
    id: string;
    localVersion: number;
    serverVersion: number;
    serverData: unknown;
  }>;
}

export interface PullResponse {
  blocks: SyncBlock[];
  tomorrowTasks: SyncTomorrowTask[];
  settings: SyncSettings | null;
  conflicts: Array<{
    id: string;
    blockId: string;
    localText: string;
    serverText: string;
  }>;
  syncedAt: string;
}

export interface LocalBlock extends SyncBlock {
  syncStatus: "synced" | "pending" | "conflict";
  serverVersion: number | null;
  lastSyncedAt: string | null;
}

export interface LocalTomorrowTask extends SyncTomorrowTask {
  syncStatus: "synced" | "pending" | "conflict";
  serverVersion: number | null;
  lastSyncedAt: string | null;
}

export type SyncStatus = "idle" | "syncing" | "error" | "offline";
