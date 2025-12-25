// Sync engine - coordinates local storage and server sync

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

export type SyncEventHandler = (
  event: SyncEventType,
  data?: unknown
) => void;

class SyncEngine {
  private status: SyncStatus = "idle";
  private listeners: Set<SyncEventHandler> = new Set();
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private isOnline = true;
  private _userId: string | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.handleOnline());
      window.addEventListener("offline", () => this.handleOffline());
      this.isOnline = navigator.onLine;
    }
  }

  // Subscribe to sync events
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

  isLoggedIn(): boolean {
    return storage.getAuthToken() !== null;
  }

  getUser(): { id: string; email: string; name: string | null } | null {
    return storage.getStoredUser();
  }

  // Initialize sync engine
  async initialize(): Promise<void> {
    const token = storage.getAuthToken();
    if (!token) {
      this.setStatus("idle");
      return;
    }

    // Verify token is still valid
    try {
      const { user } = await api.getCurrentUser();
      this._userId = user.id;
      storage.setStoredUser(user);

      // Start periodic sync
      this.startPeriodicSync();

      // Do initial sync
      await this.sync();
    } catch {
      // Token invalid, clear it
      storage.clearAuthToken();
      this.setStatus("idle");
    }
  }

  // Sign in with Google
  async signIn(idToken: string, refreshToken?: string): Promise<void> {
    try {
      const { token, user } = await api.signInWithGoogle(idToken, refreshToken);
      storage.setAuthToken(token);
      storage.setStoredUser(user);
      this._userId = user.id;

      // Push any local changes, then do full sync
      await this.pushPendingChanges();
      await this.fullSync();

      this.startPeriodicSync();
    } catch (error) {
      console.error("Sign in error:", error);
      throw error;
    }
  }

  // Sign in via internal auth (NextAuth bridge)
  async signInInternal(userData: {
    googleId: string;
    email: string;
    name: string | null;
    image?: string | null;
    refreshToken?: string | null;
  }): Promise<void> {
    try {
      const { token, user } = await api.signInInternal(userData);
      storage.setAuthToken(token);
      storage.setStoredUser(user);
      this._userId = user.id;

      // Push any local changes, then do full sync
      await this.pushPendingChanges();
      await this.fullSync();

      this.startPeriodicSync();
    } catch (error) {
      console.error("Internal sign in error:", error);
      throw error;
    }
  }

  // Sign out
  signOut(): void {
    storage.clearAuthToken();
    this._userId = null;
    this.stopPeriodicSync();
    this.setStatus("idle");
  }

  // Sync: push local changes, pull server changes
  async sync(): Promise<void> {
    if (!this.isLoggedIn()) {
      return;
    }

    if (!this.isOnline) {
      this.setStatus("offline");
      return;
    }

    try {
      this.setStatus("syncing");

      // Push pending changes
      await this.pushPendingChanges();

      // Pull changes since last sync
      const syncState = storage.getSyncState();
      const response = await api.pullChanges(syncState.lastSyncedAt || undefined);

      // Merge server data
      if (response.blocks.length > 0) {
        const merged = storage.mergeServerBlocks(response.blocks);
        this.emit("blocks-updated", merged);
      }

      if (response.tomorrowTasks.length > 0) {
        const merged = storage.mergeServerTomorrowTasks(response.tomorrowTasks);
        this.emit("tomorrow-tasks-updated", merged);
      }

      if (response.settings) {
        storage.setLocalSettings(response.settings);
        this.emit("settings-updated", response.settings);
      }

      if (response.conflicts.length > 0) {
        this.emit("conflict-detected", response.conflicts);
      }

      // Update sync state
      storage.setSyncState({
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

  // Full sync (initial load)
  async fullSync(): Promise<void> {
    if (!this.isLoggedIn() || !this.isOnline) {
      return;
    }

    try {
      this.setStatus("syncing");

      const response = await api.fullSync();

      // Replace local data with server data
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

      storage.setLocalBlocks(blocks);
      storage.setLocalTomorrowTasks(tasks);

      if (response.settings) {
        storage.setLocalSettings(response.settings);
      }

      storage.setSyncState({
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

  // Push pending local changes
  private async pushPendingChanges(): Promise<void> {
    const pendingBlocks = storage.getPendingBlocks();
    const pendingTasks = storage.getPendingTomorrowTasks();

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
        storage.markBlocksSynced(response.applied.blocks, syncedAt);
      }

      if (response.applied.tomorrowTasks.length > 0) {
        storage.markTomorrowTasksSynced(response.applied.tomorrowTasks, syncedAt);
      }

      if (response.conflicts.length > 0) {
        this.emit("conflict-detected", response.conflicts);
      }
    } catch (error) {
      console.error("Push error:", error);
      throw error;
    }
  }

  // Local data operations (these queue for sync)
  getBlocks(): LocalBlock[] {
    return storage
      .getLocalBlocks()
      .filter((b) => !b.deletedAt)
      .sort((a, b) => {
        const dateCompare =
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (dateCompare !== 0) return dateCompare;
        return a.position - b.position;
      });
  }

  getTomorrowTasks(): LocalTomorrowTask[] {
    return storage
      .getLocalTomorrowTasks()
      .filter((t) => !t.deletedAt)
      .sort((a, b) => a.position - b.position);
  }

  getSettings(): SyncSettings | null {
    return storage.getLocalSettings();
  }

  // Create or update a block
  saveBlock(block: Partial<LocalBlock> & { id: string; text: string }): LocalBlock {
    const existing = storage.getLocalBlocks().find((b) => b.id === block.id);

    const updated: LocalBlock = {
      id: block.id,
      text: block.text,
      createdAt: block.createdAt || existing?.createdAt || new Date().toISOString(),
      calendarEventId: block.calendarEventId ?? existing?.calendarEventId ?? null,
      position: block.position ?? existing?.position ?? 0,
      version: (existing?.version || 0) + 1,
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      clientId: storage.getClientId(),
      syncStatus: "pending",
      serverVersion: existing?.serverVersion ?? null,
      lastSyncedAt: existing?.lastSyncedAt ?? null,
    };

    storage.updateLocalBlock(updated);
    this.emit("blocks-updated", this.getBlocks());

    // Trigger sync if online
    if (this.isOnline && this.isLoggedIn()) {
      this.debouncedSync();
    }

    return updated;
  }

  // Delete a block (soft delete)
  deleteBlock(id: string): void {
    storage.deleteLocalBlock(id);
    this.emit("blocks-updated", this.getBlocks());

    if (this.isOnline && this.isLoggedIn()) {
      this.debouncedSync();
    }
  }

  // Save tomorrow task
  saveTomorrowTask(
    task: Partial<LocalTomorrowTask> & { id: string; text: string }
  ): LocalTomorrowTask {
    const existing = storage.getLocalTomorrowTasks().find((t) => t.id === task.id);

    const updated: LocalTomorrowTask = {
      id: task.id,
      text: task.text,
      time: task.time ?? existing?.time ?? null,
      position: task.position ?? existing?.position ?? 0,
      version: (existing?.version || 0) + 1,
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      clientId: storage.getClientId(),
      syncStatus: "pending",
      serverVersion: existing?.serverVersion ?? null,
      lastSyncedAt: existing?.lastSyncedAt ?? null,
    };

    const tasks = storage.getLocalTomorrowTasks();
    const index = tasks.findIndex((t) => t.id === task.id);
    if (index >= 0) {
      tasks[index] = updated;
    } else {
      tasks.push(updated);
    }
    storage.setLocalTomorrowTasks(tasks);

    this.emit("tomorrow-tasks-updated", this.getTomorrowTasks());

    if (this.isOnline && this.isLoggedIn()) {
      this.debouncedSync();
    }

    return updated;
  }

  // Delete tomorrow task
  deleteTomorrowTask(id: string): void {
    const tasks = storage.getLocalTomorrowTasks();
    const task = tasks.find((t) => t.id === id);
    if (task) {
      task.deletedAt = new Date().toISOString();
      task.syncStatus = "pending";
      storage.setLocalTomorrowTasks(tasks);
      this.emit("tomorrow-tasks-updated", this.getTomorrowTasks());

      if (this.isOnline && this.isLoggedIn()) {
        this.debouncedSync();
      }
    }
  }

  // Save settings
  saveSettings(settings: Partial<SyncSettings>): void {
    const current = storage.getLocalSettings() || {
      theme: "system" as const,
      dayCutHour: 4,
      updatedAt: new Date().toISOString(),
    };

    const updated: SyncSettings = {
      ...current,
      ...settings,
      updatedAt: new Date().toISOString(),
    };

    storage.setLocalSettings(updated);
    this.emit("settings-updated", updated);

    if (this.isOnline && this.isLoggedIn()) {
      this.debouncedSync();
    }
  }

  // Debounced sync
  private syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  private debouncedSync(): void {
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
    }
    this.syncDebounceTimer = setTimeout(() => {
      this.sync();
    }, 1000);
  }

  // Periodic sync
  private startPeriodicSync(): void {
    this.stopPeriodicSync();
    this.syncInterval = setInterval(() => {
      if (this.isOnline) {
        this.sync();
      }
    }, 30000); // Sync every 30 seconds
  }

  private stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // Online/offline handlers
  private handleOnline(): void {
    this.isOnline = true;
    if (this.isLoggedIn()) {
      this.sync();
    }
    this.setStatus(this.isLoggedIn() ? "idle" : "idle");
  }

  private handleOffline(): void {
    this.isOnline = false;
    this.setStatus("offline");
  }

  // Check if we're online
  checkOnline(): boolean {
    return this.isOnline;
  }

  // Manual trigger for checking connectivity
  async checkConnectivity(): Promise<boolean> {
    const online = await api.checkHealth();
    this.isOnline = online;
    if (!online) {
      this.setStatus("offline");
    }
    return online;
  }
}

// Singleton instance
export const syncEngine = new SyncEngine();
