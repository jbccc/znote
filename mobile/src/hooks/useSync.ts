import { useState, useEffect } from "react";
import {
  syncEngine,
  SyncStatus,
  LocalBlock,
  LocalTomorrowTask,
  SyncSettings,
  SyncEventType,
} from "../lib/sync";

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
  const [initialized, setInitialized] = useState(false);

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
        case "error":
          console.error("Sync error:", data);
          break;
      }
    };

    const unsubscribe = syncEngine.subscribe(handleEvent);

    const init = async () => {
      await syncEngine.initialize();
      const loggedIn = await syncEngine.isLoggedIn();
      setIsLoggedIn(loggedIn);
      setUser(await syncEngine.getUser());
      setBlocks(await syncEngine.getBlocks());
      setTomorrowTasks(await syncEngine.getTomorrowTasks());
      setSettings(await syncEngine.getSettings());
      setStatus(syncEngine.getStatus());
      setInitialized(true);
    };

    init();

    return () => {
      unsubscribe();
    };
  }, []);

  const signIn = async (idToken: string, refreshToken?: string) => {
    await syncEngine.signIn(idToken, refreshToken);
    setIsLoggedIn(true);
    setUser(await syncEngine.getUser());
    setBlocks(await syncEngine.getBlocks());
    setTomorrowTasks(await syncEngine.getTomorrowTasks());
    setSettings(await syncEngine.getSettings());
  };

  const signOut = async () => {
    await syncEngine.signOut();
    setIsLoggedIn(false);
    setUser(null);
  };

  const saveBlock = async (block: Partial<LocalBlock> & { id: string; text: string }) => {
    return syncEngine.saveBlock(block);
  };

  const deleteBlock = async (id: string) => {
    await syncEngine.deleteBlock(id);
  };

  const saveTomorrowTask = async (task: Partial<LocalTomorrowTask> & { id: string; text: string }) => {
    return syncEngine.saveTomorrowTask(task);
  };

  const saveSettings = async (newSettings: Partial<SyncSettings>) => {
    await syncEngine.saveSettings(newSettings);
  };

  const sync = async () => {
    await syncEngine.sync();
  };

  return {
    status,
    isLoggedIn,
    user,
    blocks,
    tomorrowTasks,
    settings,
    initialized,
    isOnline: syncEngine.checkOnline(),
    signIn,
    signOut,
    saveBlock,
    deleteBlock,
    saveTomorrowTask,
    saveSettings,
    sync,
  };
}
