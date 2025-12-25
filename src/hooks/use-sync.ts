"use client";

import { useState, useEffect, useCallback } from "react";
import {
  syncEngine,
  type SyncStatus,
  type LocalBlock,
  type LocalTomorrowTask,
  type SyncSettings,
  type SyncEventType,
} from "@/lib/sync";

export function useSync() {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<{
    id: string;
    email: string;
    name: string | null;
  } | null>(null);
  const [blocks, setBlocks] = useState<LocalBlock[]>([]);
  const [tomorrowTasks, setTomorrowTasks] = useState<LocalTomorrowTask[]>([]);
  const [settings, setSettings] = useState<SyncSettings | null>(null);
  const [conflicts, setConflicts] = useState<unknown[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Initialize sync engine and load data
  useEffect(() => {
    const handleEvent = (event: SyncEventType, data?: unknown) => {
      switch (event) {
        case "status-change":
          setStatus(data as SyncStatus);
          break;
        case "blocks-updated":
          setBlocks(data as LocalBlock[]);
          break;
        case "tomorrow-tasks-updated":
          setTomorrowTasks(data as LocalTomorrowTask[]);
          break;
        case "settings-updated":
          setSettings(data as SyncSettings);
          break;
        case "conflict-detected":
          setConflicts((prev) => [...prev, ...(data as unknown[])]);
          break;
        case "error":
          console.error("Sync error:", data);
          break;
      }
    };

    const unsubscribe = syncEngine.subscribe(handleEvent);

    // Initialize
    const init = async () => {
      await syncEngine.initialize();
      setIsLoggedIn(syncEngine.isLoggedIn());
      setUser(syncEngine.getUser());
      setBlocks(syncEngine.getBlocks());
      setTomorrowTasks(syncEngine.getTomorrowTasks());
      setSettings(syncEngine.getSettings());
      setStatus(syncEngine.getStatus());
      setInitialized(true);
    };

    init();

    return () => {
      unsubscribe();
    };
  }, []);

  // Sign in
  const signIn = useCallback(async (idToken: string, refreshToken?: string) => {
    await syncEngine.signIn(idToken, refreshToken);
    setIsLoggedIn(true);
    setUser(syncEngine.getUser());
    setBlocks(syncEngine.getBlocks());
    setTomorrowTasks(syncEngine.getTomorrowTasks());
    setSettings(syncEngine.getSettings());
  }, []);

  // Sign in via internal auth (NextAuth bridge)
  const signInInternal = useCallback(
    async (userData: {
      googleId: string;
      email: string;
      name: string | null;
      image?: string | null;
      refreshToken?: string | null;
    }) => {
      await syncEngine.signInInternal(userData);
      setIsLoggedIn(true);
      setUser(syncEngine.getUser());
      setBlocks(syncEngine.getBlocks());
      setTomorrowTasks(syncEngine.getTomorrowTasks());
      setSettings(syncEngine.getSettings());
    },
    []
  );

  // Sign out
  const signOut = useCallback(() => {
    syncEngine.signOut();
    setIsLoggedIn(false);
    setUser(null);
  }, []);

  // Save block
  const saveBlock = useCallback(
    (block: Partial<LocalBlock> & { id: string; text: string }) => {
      return syncEngine.saveBlock(block);
    },
    []
  );

  // Delete block
  const deleteBlock = useCallback((id: string) => {
    syncEngine.deleteBlock(id);
  }, []);

  // Save tomorrow task
  const saveTomorrowTask = useCallback(
    (task: Partial<LocalTomorrowTask> & { id: string; text: string }) => {
      return syncEngine.saveTomorrowTask(task);
    },
    []
  );

  // Delete tomorrow task
  const deleteTomorrowTask = useCallback((id: string) => {
    syncEngine.deleteTomorrowTask(id);
  }, []);

  // Save settings
  const saveSettings = useCallback((newSettings: Partial<SyncSettings>) => {
    syncEngine.saveSettings(newSettings);
  }, []);

  // Manual sync
  const sync = useCallback(async () => {
    await syncEngine.sync();
  }, []);

  // Full sync
  const fullSync = useCallback(async () => {
    await syncEngine.fullSync();
  }, []);

  // Clear a conflict
  const dismissConflict = useCallback((index: number) => {
    setConflicts((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return {
    // State
    status,
    isLoggedIn,
    user,
    blocks,
    tomorrowTasks,
    settings,
    conflicts,
    initialized,
    isOnline: syncEngine.checkOnline(),

    // Actions
    signIn,
    signInInternal,
    signOut,
    saveBlock,
    deleteBlock,
    saveTomorrowTask,
    deleteTomorrowTask,
    saveSettings,
    sync,
    fullSync,
    dismissConflict,
  };
}
