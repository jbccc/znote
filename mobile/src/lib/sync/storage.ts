// Mobile storage using SecureStore for auth and AsyncStorage for data

import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  API_URL: "znote-sync-api-url",
};

// Client ID
let cachedClientId: string | null = null;

export async function getClientId(): Promise<string> {
  if (cachedClientId) return cachedClientId;

  let clientId = await AsyncStorage.getItem(STORAGE_KEYS.CLIENT_ID);
  if (!clientId) {
    clientId = `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await AsyncStorage.setItem(STORAGE_KEYS.CLIENT_ID, clientId);
  }
  cachedClientId = clientId;
  return clientId;
}

// Auth token (secure storage with fallback to AsyncStorage for Expo Go)
let cachedToken: string | null = null;

export async function getAuthToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  try {
    cachedToken = await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
  } catch {
    // SecureStore fails in Expo Go, fall back to AsyncStorage
    cachedToken = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  }
  return cachedToken;
}

export async function setAuthToken(token: string): Promise<void> {
  cachedToken = token;
  try {
    await SecureStore.setItemAsync(STORAGE_KEYS.AUTH_TOKEN, token);
  } catch {
    // SecureStore fails in Expo Go, fall back to AsyncStorage
    await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
  }
}

export async function clearAuthToken(): Promise<void> {
  cachedToken = null;
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_TOKEN);
  } catch {
    // Ignore
  }
  await AsyncStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
  await AsyncStorage.removeItem(STORAGE_KEYS.USER);
}

// User info
export async function getStoredUser(): Promise<{ id: string; email: string; name: string | null } | null> {
  const stored = await AsyncStorage.getItem(STORAGE_KEYS.USER);
  return stored ? JSON.parse(stored) : null;
}

export async function setStoredUser(user: { id: string; email: string; name: string | null }): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
}

// API URL
export async function getApiUrl(): Promise<string> {
  const stored = await AsyncStorage.getItem(STORAGE_KEYS.API_URL);
  return stored || "http://localhost:3001";
}

export async function setApiUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.API_URL, url);
}

// Blocks
export async function getLocalBlocks(): Promise<LocalBlock[]> {
  const stored = await AsyncStorage.getItem(STORAGE_KEYS.BLOCKS);
  return stored ? JSON.parse(stored) : [];
}

export async function setLocalBlocks(blocks: LocalBlock[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.BLOCKS, JSON.stringify(blocks));
}

export async function updateLocalBlock(block: LocalBlock): Promise<void> {
  const blocks = await getLocalBlocks();
  const index = blocks.findIndex((b) => b.id === block.id);
  if (index >= 0) {
    blocks[index] = block;
  } else {
    blocks.push(block);
  }
  await setLocalBlocks(blocks);
}

export async function deleteLocalBlock(id: string): Promise<void> {
  const blocks = await getLocalBlocks();
  const block = blocks.find((b) => b.id === id);
  if (block) {
    block.deletedAt = new Date().toISOString();
    block.syncStatus = "pending";
    await setLocalBlocks(blocks);
  }
}

// Tomorrow Tasks
export async function getLocalTomorrowTasks(): Promise<LocalTomorrowTask[]> {
  const stored = await AsyncStorage.getItem(STORAGE_KEYS.TOMORROW_TASKS);
  return stored ? JSON.parse(stored) : [];
}

export async function setLocalTomorrowTasks(tasks: LocalTomorrowTask[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.TOMORROW_TASKS, JSON.stringify(tasks));
}

// Settings
export async function getLocalSettings(): Promise<SyncSettings | null> {
  const stored = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
  return stored ? JSON.parse(stored) : null;
}

export async function setLocalSettings(settings: SyncSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}

// Sync state
export interface SyncState {
  lastSyncedAt: string | null;
  serverCursor: string | null;
}

export async function getSyncState(): Promise<SyncState> {
  const stored = await AsyncStorage.getItem(STORAGE_KEYS.SYNC_STATE);
  return stored ? JSON.parse(stored) : { lastSyncedAt: null, serverCursor: null };
}

export async function setSyncState(state: SyncState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.SYNC_STATE, JSON.stringify(state));
}

// Get pending changes
export async function getPendingBlocks(): Promise<LocalBlock[]> {
  const blocks = await getLocalBlocks();
  return blocks.filter((b) => b.syncStatus === "pending");
}

export async function getPendingTomorrowTasks(): Promise<LocalTomorrowTask[]> {
  const tasks = await getLocalTomorrowTasks();
  return tasks.filter((t) => t.syncStatus === "pending");
}

// Mark as synced
export async function markBlocksSynced(ids: string[], syncedAt: string): Promise<void> {
  const blocks = await getLocalBlocks();
  for (const block of blocks) {
    if (ids.includes(block.id)) {
      block.syncStatus = "synced";
      block.lastSyncedAt = syncedAt;
      block.serverVersion = block.version;
    }
  }
  await setLocalBlocks(blocks);
}

export async function markTomorrowTasksSynced(ids: string[], syncedAt: string): Promise<void> {
  const tasks = await getLocalTomorrowTasks();
  for (const task of tasks) {
    if (ids.includes(task.id)) {
      task.syncStatus = "synced";
      task.lastSyncedAt = syncedAt;
      task.serverVersion = task.version;
    }
  }
  await setLocalTomorrowTasks(tasks);
}

// Merge server data
export async function mergeServerBlocks(serverBlocks: SyncBlock[]): Promise<LocalBlock[]> {
  const localBlocks = await getLocalBlocks();
  const merged: LocalBlock[] = [];
  const seenIds = new Set<string>();

  for (const serverBlock of serverBlocks) {
    seenIds.add(serverBlock.id);
    const local = localBlocks.find((b) => b.id === serverBlock.id);

    if (!local) {
      merged.push({
        ...serverBlock,
        syncStatus: "synced",
        serverVersion: serverBlock.version,
        lastSyncedAt: new Date().toISOString(),
      });
    } else if (local.syncStatus === "pending") {
      if (serverBlock.version > (local.serverVersion || 0)) {
        merged.push({
          ...local,
          syncStatus: "conflict",
          serverVersion: serverBlock.version,
        });
      } else {
        merged.push(local);
      }
    } else {
      merged.push({
        ...serverBlock,
        syncStatus: "synced",
        serverVersion: serverBlock.version,
        lastSyncedAt: new Date().toISOString(),
      });
    }
  }

  for (const local of localBlocks) {
    if (!seenIds.has(local.id)) {
      merged.push(local);
    }
  }

  await setLocalBlocks(merged);
  return merged;
}

export async function mergeServerTomorrowTasks(serverTasks: SyncTomorrowTask[]): Promise<LocalTomorrowTask[]> {
  const localTasks = await getLocalTomorrowTasks();
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

  await setLocalTomorrowTasks(merged);
  return merged;
}
