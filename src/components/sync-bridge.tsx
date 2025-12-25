"use client";

import { useEffect, useRef } from "react";
import { syncEngine } from "@/lib/sync";
import { getAuthToken } from "@/lib/sync/storage";

interface SyncBridgeProps {
  isLoggedIn: boolean;
}

// Bridges NextAuth session with sync server authentication
export function SyncBridge({ isLoggedIn }: SyncBridgeProps) {
  const hasAttemptedSync = useRef(false);

  useEffect(() => {
    if (!isLoggedIn) {
      // User logged out of NextAuth, also sign out of sync
      if (getAuthToken()) {
        syncEngine.signOut();
      }
      hasAttemptedSync.current = false;
      return;
    }

    // Already have a sync token, just initialize
    if (getAuthToken()) {
      syncEngine.initialize();
      return;
    }

    // Prevent duplicate auth attempts
    if (hasAttemptedSync.current) {
      return;
    }
    hasAttemptedSync.current = true;

    // User is logged into NextAuth but not sync server
    // Fetch their info and authenticate with sync server
    const authenticateWithSyncServer = async () => {
      try {
        const response = await fetch("/api/sync-token");
        if (!response.ok) {
          console.error("Failed to get sync token info");
          return;
        }

        const data = await response.json();

        // Authenticate with sync server
        await syncEngine.signInInternal({
          googleId: data.user.googleId,
          email: data.user.email,
          name: data.user.name,
          image: data.user.image,
          refreshToken: data.refreshToken,
        });

        console.log("Sync server authenticated");
      } catch (error) {
        console.error("Sync bridge error:", error);
        hasAttemptedSync.current = false; // Allow retry
      }
    };

    authenticateWithSyncServer();
  }, [isLoggedIn]);

  return null;
}
