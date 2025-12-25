// Sync engine for React Native - async version

import { AppState, AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import type {
  LocalBlock,
  LocalTomorrowTask,
  SyncSettings,
  SyncStatus,
} from "./types";
import * as storage from "./storage";
import * as api from "./api";

export type SyncEventType =
  | "status-change"
  | "blocks-updated"
  | "tomorrow-tasks-updated"
  | "settings-updated"
  | "conflict-detected"
  | "error";

export type SyncEventHandler = (event: SyncEventType, data?: unknown) => void;

class SyncEngine {
  private status: SyncStatus = "idle";
  private listeners: Set<SyncEventHandler> = new Set();
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private isOnline = true;
  private _userId: string | null = null;

  constructor() {
    // Listen for network changes
    NetInfo.addEventListener((state) => {
      const wasOnline = this.isOnline;
      this.isOnline = state.isConnected ?? false;

      if (!wasOnline && this.isOnline) {
        this.handleOnline();
      } else if (wasOnline && !this.isOnline) {
        this.handleOffline();
      }
    });

    // Listen for app state changes
    AppState.addEventListener("change", this.handleAppStateChange);
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState === "active" && this.isOnline) {
      this.sync();
    }
  };

  subscribe(handler: SyncEventHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  private emit(event: SyncEventType, data?: unknown): void {
    for (const handler of this.listeners) {
      try {
        handler(event, data);
      } catch (e) {
        console.error("Sync event handler error:", e);
      }
    }
  }

  private setStatus(status: SyncStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.emit("status-change", status);
    }
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  async isLoggedIn(): Promise<boolean> {
    const token = await storage.getAuthToken();
    return token !== null;
  }

  async getUser(): Promise<{ id: string; email: string; name: string | null } | null> {
    return storage.getStoredUser();
  }

  async initialize(): Promise<void> {
    const token = await storage.getAuthToken();
    if (!token) {
      this.setStatus("idle");
      return;
    }

    try {
      const { user } = await api.getCurrentUser();
      this._userId = user.id;
      await storage.setStoredUser(user);
      this.startPeriodicSync();
      await this.sync();
    } catch {
      await storage.clearAuthToken();
      this.setStatus("idle");
    }
  }

  async signIn(idToken: string, refreshToken?: string): Promise<void> {
    try {
      const { token, user } = await api.signInWithGoogle(idToken, refreshToken);
      await storage.setAuthToken(token);
      await storage.setStoredUser(user);
      this._userId = user.id;

      await this.pushPendingChanges();
      await this.fullSync();

      this.startPeriodicSync();
    } catch (error) {
      console.error("Sign in error:", error);
      throw error;
    }
  }

  async signOut(): Promise<void> {
    await storage.clearAuthToken();
    this._userId = null;
    this.stopPeriodicSync();
    this.setStatus("idle");
  }

  async sync(): Promise<void> {
    const loggedIn = await this.isLoggedIn();
    if (!loggedIn) return;

    if (!this.isOnline) {
      this.setStatus("offline");
      return;
    }

    try {
      this.setStatus("syncing");

      await this.pushPendingChanges();

      const syncState = await storage.getSyncState();
      const response = await api.pullChanges(syncState.lastSyncedAt || undefined);

      if (response.blocks.length > 0) {
        const merged = await storage.mergeServerBlocks(response.blocks);
        this.emit("blocks-updated", merged);
      }

      if (response.tomorrowTasks.length > 0) {
        const merged = await storage.mergeServerTomorrowTasks(response.tomorrowTasks);
        this.emit("tomorrow-tasks-updated", merged);
      }

      if (response.settings) {
        await storage.setLocalSettings(response.settings);
        this.emit("settings-updated", response.settings);
      }

      if (response.conflicts.length > 0) {
        this.emit("conflict-detected", response.conflicts);
      }

      await storage.setSyncState({
        lastSyncedAt: response.syncedAt,
        serverCursor: null,
      });

      this.setStatus("idle");
    } catch (error) {
      console.error("Sync error:", error);
      this.setStatus("error");
      this.emit("error", error);
    }
  }

  async fullSync(): Promise<void> {
    const loggedIn = await this.isLoggedIn();
    if (!loggedIn || !this.isOnline) return;

    try {
      this.setStatus("syncing");

      const response = await api.fullSync();

      const blocks: LocalBlock[] = response.blocks.map((b) => ({
        ...b,
        syncStatus: "synced" as const,
        serverVersion: b.version,
        lastSyncedAt: response.syncedAt,
      }));

      const tasks: LocalTomorrowTask[] = response.tomorrowTasks.map((t) => ({
        ...t,
        syncStatus: "synced" as const,
        serverVersion: t.version,
        lastSyncedAt: response.syncedAt,
      }));

      await storage.setLocalBlocks(blocks);
      await storage.setLocalTomorrowTasks(tasks);

      if (response.settings) {
        await storage.setLocalSettings(response.settings);
      }

      await storage.setSyncState({
        lastSyncedAt: response.syncedAt,
        serverCursor: null,
      });

      this.emit("blocks-updated", blocks);
      this.emit("tomorrow-tasks-updated", tasks);
      if (response.settings) {
        this.emit("settings-updated", response.settings);
      }

      this.setStatus("idle");
    } catch (error) {
      console.error("Full sync error:", error);
      this.setStatus("error");
      this.emit("error", error);
    }
  }

  private async pushPendingChanges(): Promise<void> {
    const pendingBlocks = await storage.getPendingBlocks();
    const pendingTasks = await storage.getPendingTomorrowTasks();

    if (pendingBlocks.length === 0 && pendingTasks.length === 0) {
      return;
    }

    try {
      const response = await api.pushChanges(
        pendingBlocks.length > 0 ? pendingBlocks : undefined,
        pendingTasks.length > 0 ? pendingTasks : undefined
      );

      const syncedAt = new Date().toISOString();

      if (response.applied.blocks.length > 0) {
        await storage.markBlocksSynced(response.applied.blocks, syncedAt);
      }

      if (response.applied.tomorrowTasks.length > 0) {
        await storage.markTomorrowTasksSynced(response.applied.tomorrowTasks, syncedAt);
      }

      if (response.conflicts.length > 0) {
        this.emit("conflict-detected", response.conflicts);
      }
    } catch (error) {
      console.error("Push error:", error);
      throw error;
    }
  }

  async getBlocks(): Promise<LocalBlock[]> {
    const blocks = await storage.getLocalBlocks();
    return blocks
      .filter((b) => !b.deletedAt)
      .sort((a, b) => {
        const dateCompare = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (dateCompare !== 0) return dateCompare;
        return a.position - b.position;
      });
  }

  async getTomorrowTasks(): Promise<LocalTomorrowTask[]> {
    const tasks = await storage.getLocalTomorrowTasks();
    return tasks.filter((t) => !t.deletedAt).sort((a, b) => a.position - b.position);
  }

  async getSettings(): Promise<SyncSettings | null> {
    return storage.getLocalSettings();
  }

  async saveBlock(block: Partial<LocalBlock> & { id: string; text: string }): Promise<LocalBlock> {
    const blocks = await storage.getLocalBlocks();
    const existing = blocks.find((b) => b.id === block.id);
    const clientId = await storage.getClientId();

    const updated: LocalBlock = {
      id: block.id,
      text: block.text,
      createdAt: block.createdAt || existing?.createdAt || new Date().toISOString(),
      calendarEventId: block.calendarEventId ?? existing?.calendarEventId ?? null,
      position: block.position ?? existing?.position ?? 0,
      version: (existing?.version || 0) + 1,
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      clientId,
      syncStatus: "pending",
      serverVersion: existing?.serverVersion ?? null,
      lastSyncedAt: existing?.lastSyncedAt ?? null,
    };

    await storage.updateLocalBlock(updated);
    this.emit("blocks-updated", await this.getBlocks());

    if (this.isOnline) {
      this.debouncedSync();
    }

    return updated;
  }

  async deleteBlock(id: string): Promise<void> {
    await storage.deleteLocalBlock(id);
    this.emit("blocks-updated", await this.getBlocks());

    if (this.isOnline) {
      this.debouncedSync();
    }
  }

  async saveTomorrowTask(
    task: Partial<LocalTomorrowTask> & { id: string; text: string }
  ): Promise<LocalTomorrowTask> {
    const tasks = await storage.getLocalTomorrowTasks();
    const existing = tasks.find((t) => t.id === task.id);
    const clientId = await storage.getClientId();

    const updated: LocalTomorrowTask = {
      id: task.id,
      text: task.text,
      time: task.time ?? existing?.time ?? null,
      position: task.position ?? existing?.position ?? 0,
      version: (existing?.version || 0) + 1,
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      clientId,
      syncStatus: "pending",
      serverVersion: existing?.serverVersion ?? null,
      lastSyncedAt: existing?.lastSyncedAt ?? null,
    };

    const index = tasks.findIndex((t) => t.id === task.id);
    if (index >= 0) {
      tasks[index] = updated;
    } else {
      tasks.push(updated);
    }
    await storage.setLocalTomorrowTasks(tasks);

    this.emit("tomorrow-tasks-updated", await this.getTomorrowTasks());

    if (this.isOnline) {
      this.debouncedSync();
    }

    return updated;
  }

  async saveSettings(settings: Partial<SyncSettings>): Promise<void> {
    const current = (await storage.getLocalSettings()) || {
      theme: "system" as const,
      dayCutHour: 4,
      updatedAt: new Date().toISOString(),
    };

    const updated: SyncSettings = {
      ...current,
      ...settings,
      updatedAt: new Date().toISOString(),
    };

    await storage.setLocalSettings(updated);
    this.emit("settings-updated", updated);

    if (this.isOnline) {
      this.debouncedSync();
    }
  }

  private syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  private debouncedSync(): void {
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
    }
    this.syncDebounceTimer = setTimeout(() => {
      this.sync();
    }, 1000);
  }

  private startPeriodicSync(): void {
    this.stopPeriodicSync();
    this.syncInterval = setInterval(() => {
      if (this.isOnline) {
        this.sync();
      }
    }, 30000);
  }

  private stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  private handleOnline(): void {
    this.isOnline = true;
    this.isLoggedIn().then((loggedIn) => {
      if (loggedIn) {
        this.sync();
      }
    });
    this.setStatus("idle");
  }

  private handleOffline(): void {
    this.isOnline = false;
    this.setStatus("offline");
  }

  checkOnline(): boolean {
    return this.isOnline;
  }
}

export const syncEngine = new SyncEngine();
