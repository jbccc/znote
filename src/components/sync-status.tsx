"use client";

import type { SyncStatus } from "@/lib/sync";

interface SyncStatusProps {
  status: SyncStatus;
  isOnline: boolean;
}

export function SyncStatusIndicator({ status, isOnline }: SyncStatusProps) {
  if (!isOnline) {
    return (
      <span className="text-xs text-amber-500/60">
        offline
      </span>
    );
  }

  switch (status) {
    case "syncing":
      return (
        <span className="text-xs text-foreground/20">
          syncing...
        </span>
      );
    case "error":
      return (
        <span className="text-xs text-red-500/60">
          sync error
        </span>
      );
    default:
      return null;
  }
}
