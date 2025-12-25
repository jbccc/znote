"use client";

import { createContext, useContext, ReactNode } from "react";
import { useSync } from "@/hooks/use-sync";
import type {
  SyncStatus,
  LocalBlock,
  LocalTomorrowTask,
  SyncSettings,
} from "@/lib/sync";

interface SyncContextValue {
  // State
  status: SyncStatus;
  isLoggedIn: boolean;
  user: { id: string; email: string; name: string | null } | null;
  blocks: LocalBlock[];
  tomorrowTasks: LocalTomorrowTask[];
  settings: SyncSettings | null;
  conflicts: unknown[];
  initialized: boolean;
  isOnline: boolean;

  // Actions
  signIn: (idToken: string, refreshToken?: string) => Promise<void>;
  signOut: () => void;
  saveBlock: (
    block: Partial<LocalBlock> & { id: string; text: string }
  ) => LocalBlock;
  deleteBlock: (id: string) => void;
  saveTomorrowTask: (
    task: Partial<LocalTomorrowTask> & { id: string; text: string }
  ) => LocalTomorrowTask;
  deleteTomorrowTask: (id: string) => void;
  saveSettings: (settings: Partial<SyncSettings>) => void;
  sync: () => Promise<void>;
  fullSync: () => Promise<void>;
  dismissConflict: (index: number) => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const syncValue = useSync();

  return (
    <SyncContext.Provider value={syncValue}>{children}</SyncContext.Provider>
  );
}

export function useSyncContext(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSyncContext must be used within a SyncProvider");
  }
  return context;
}
