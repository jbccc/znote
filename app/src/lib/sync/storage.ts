// Local storage for offline support
// Uses localStorage in browser, could use SQLite in Electron

import type {
  LocalBlock,
  LocalTomorrowTask,
  SyncSettings,
  SyncBlock,
  SyncTomorrowTask,
} from "./types";

const STORAGE_KEYS = {
  BLOCKS: "znote-blocks",
  TOMORROW_TASKS: "znote-tomorrow-tasks",
  SETTINGS: "znote-settings",
  SYNC_STATE: "znote-sync-state",
  CLIENT_ID: "znote-client-id",
  AUTH_TOKEN: "znote-auth-token",
  USER: "znote-user",
};

// Generate a unique client ID for this device
export function getClientId(): string {
  let clientId = localStorage.getItem(STORAGE_KEYS.CLIENT_ID);
  if (!clientId) {
    clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem(STORAGE_KEYS.CLIENT_ID, clientId);
  }
  return clientId;
}

// Auth token management
export function getAuthToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER);
}

export function getStoredUser(): { id: string; email: string; name: string | null } | null {
  const stored = localStorage.getItem(STORAGE_KEYS.USER);
  return stored ? JSON.parse(stored) : null;
}

export function setStoredUser(user: { id: string; email: string; name: string | null }): void {
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
}

// Blocks
export function getLocalBlocks(): LocalBlock[] {
  const stored = localStorage.getItem(STORAGE_KEYS.BLOCKS);
  return stored ? JSON.parse(stored) : [];
}

export function setLocalBlocks(blocks: LocalBlock[]): void {
  localStorage.setItem(STORAGE_KEYS.BLOCKS, JSON.stringify(blocks));
}

export function updateLocalBlock(block: LocalBlock): void {
  const blocks = getLocalBlocks();
  const index = blocks.findIndex((b) => b.id === block.id);
  if (index >= 0) {
    blocks[index] = block;
  } else {
    blocks.push(block);
  }
  setLocalBlocks(blocks);
}

export function deleteLocalBlock(id: string): void {
  const blocks = getLocalBlocks();
  const block = blocks.find((b) => b.id === id);
  if (block) {
    block.deletedAt = new Date().toISOString();
    block.syncStatus = "pending";
    setLocalBlocks(blocks);
  }
}

// Tomorrow Tasks
export function getLocalTomorrowTasks(): LocalTomorrowTask[] {
  const stored = localStorage.getItem(STORAGE_KEYS.TOMORROW_TASKS);
  return stored ? JSON.parse(stored) : [];
}

export function setLocalTomorrowTasks(tasks: LocalTomorrowTask[]): void {
  localStorage.setItem(STORAGE_KEYS.TOMORROW_TASKS, JSON.stringify(tasks));
}

// Settings
export function getLocalSettings(): SyncSettings | null {
  const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
  return stored ? JSON.parse(stored) : null;
}

export function setLocalSettings(settings: SyncSettings): void {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}

// Sync state
export interface SyncState {
  lastSyncedAt: string | null;
  serverCursor: string | null;
}

export function getSyncState(): SyncState {
  const stored = localStorage.getItem(STORAGE_KEYS.SYNC_STATE);
  return stored ? JSON.parse(stored) : { lastSyncedAt: null, serverCursor: null };
}

export function setSyncState(state: SyncState): void {
  localStorage.setItem(STORAGE_KEYS.SYNC_STATE, JSON.stringify(state));
}

// Get pending changes to push
export function getPendingBlocks(): LocalBlock[] {
  return getLocalBlocks().filter((b) => b.syncStatus === "pending");
}

export function getPendingTomorrowTasks(): LocalTomorrowTask[] {
  return getLocalTomorrowTasks().filter((t) => t.syncStatus === "pending");
}

// Mark blocks as synced
export function markBlocksSynced(ids: string[], syncedAt: string): void {
  const blocks = getLocalBlocks();
  for (const block of blocks) {
    if (ids.includes(block.id)) {
      block.syncStatus = "synced";
      block.lastSyncedAt = syncedAt;
      block.serverVersion = block.version;
    }
  }
  setLocalBlocks(blocks);
}

export function markTomorrowTasksSynced(ids: string[], syncedAt: string): void {
  const tasks = getLocalTomorrowTasks();
  for (const task of tasks) {
    if (ids.includes(task.id)) {
      task.syncStatus = "synced";
      task.lastSyncedAt = syncedAt;
      task.serverVersion = task.version;
    }
  }
  setLocalTomorrowTasks(tasks);
}

// Merge server data into local
export function mergeServerBlocks(serverBlocks: SyncBlock[]): LocalBlock[] {
  const localBlocks = getLocalBlocks();
  const merged: LocalBlock[] = [];
  const seenIds = new Set<string>();

  // First, process server blocks
  for (const serverBlock of serverBlocks) {
    seenIds.add(serverBlock.id);
    const local = localBlocks.find((b) => b.id === serverBlock.id);

    if (!local) {
      // New from server
      merged.push({
        ...serverBlock,
        syncStatus: "synced",
        serverVersion: serverBlock.version,
        lastSyncedAt: new Date().toISOString(),
      });
    } else if (local.syncStatus === "pending") {
      // Local has pending changes - keep local, mark as conflict if versions differ
      if (serverBlock.version > (local.serverVersion || 0)) {
        // Server has newer version - this is a conflict
        merged.push({
          ...local,
          syncStatus: "conflict",
          serverVersion: serverBlock.version,
        });
      } else {
        // Our version is newer or same, keep pending
        merged.push(local);
      }
    } else {
      // Local is synced - take server version
      merged.push({
        ...serverBlock,
        syncStatus: "synced",
        serverVersion: serverBlock.version,
        lastSyncedAt: new Date().toISOString(),
      });
    }
  }

  // Then, keep local-only blocks (new or pending)
  for (const local of localBlocks) {
    if (!seenIds.has(local.id)) {
      merged.push(local);
    }
  }

  setLocalBlocks(merged);
  return merged;
}

export function mergeServerTomorrowTasks(
  serverTasks: SyncTomorrowTask[]
): LocalTomorrowTask[] {
  const localTasks = getLocalTomorrowTasks();
  const merged: LocalTomorrowTask[] = [];
  const seenIds = new Set<string>();

  for (const serverTask of serverTasks) {
    seenIds.add(serverTask.id);
    const local = localTasks.find((t) => t.id === serverTask.id);

    if (!local) {
      merged.push({
        ...serverTask,
        syncStatus: "synced",
        serverVersion: serverTask.version,
        lastSyncedAt: new Date().toISOString(),
      });
    } else if (local.syncStatus === "pending") {
      if (serverTask.version > (local.serverVersion || 0)) {
        merged.push({
          ...local,
          syncStatus: "conflict",
          serverVersion: serverTask.version,
        });
      } else {
        merged.push(local);
      }
    } else {
      merged.push({
        ...serverTask,
        syncStatus: "synced",
        serverVersion: serverTask.version,
        lastSyncedAt: new Date().toISOString(),
      });
    }
  }

  for (const local of localTasks) {
    if (!seenIds.has(local.id)) {
      merged.push(local);
    }
  }

  setLocalTomorrowTasks(merged);
  return merged;
}

// Convert old format to new format (migration helper)
export function migrateFromOldFormat(oldContent: string): LocalBlock[] {
  try {
    const data = JSON.parse(oldContent);
    const blocks: LocalBlock[] = [];

    if (data.blocks && Array.isArray(data.blocks)) {
      for (const block of data.blocks) {
        blocks.push({
          id: block.id || Math.random().toString(36).slice(2, 9),
          text: block.text || "",
          createdAt: block.createdAt || new Date().toISOString(),
          calendarEventId: block.calendarEventId || null,
          position: 0,
          version: 1,
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          syncStatus: "pending",
          serverVersion: null,
          lastSyncedAt: null,
        });
      }
    }

    return blocks;
  } catch {
    return [];
  }
}
