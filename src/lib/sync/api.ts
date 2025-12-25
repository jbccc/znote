// API client for the sync server

import type {
  PushPayload,
  PushResponse,
  PullResponse,
  SyncBlock,
  SyncTomorrowTask,
  SyncSettings,
} from "./types";
import { getAuthToken, getClientId } from "./storage";

const DEFAULT_API_URL = "http://localhost:3001";

function getStoredApiUrl(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("znote-sync-api-url");
}

export function setApiUrl(url: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("znote-sync-api-url", url);
  }
}

export function getApiUrl(): string {
  return (
    getStoredApiUrl() ||
    process.env.NEXT_PUBLIC_SYNC_API_URL ||
    DEFAULT_API_URL
  );
}

async function fetchApi<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const apiUrl = getApiUrl();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

// Auth
export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
  };
}

export async function signInWithGoogle(
  idToken: string,
  refreshToken?: string
): Promise<AuthResponse> {
  return fetchApi<AuthResponse>("/auth/google", {
    method: "POST",
    body: JSON.stringify({ idToken, refreshToken }),
  });
}

// Internal auth (for NextAuth bridge)
export async function signInInternal(userData: {
  googleId: string;
  email: string;
  name: string | null;
  image?: string | null;
  refreshToken?: string | null;
}): Promise<AuthResponse> {
  return fetchApi<AuthResponse>("/auth/internal", {
    method: "POST",
    body: JSON.stringify(userData),
  });
}

export async function getCurrentUser(): Promise<{ user: AuthResponse["user"] }> {
  return fetchApi("/auth/me");
}

// Sync
export async function pushChanges(
  blocks?: SyncBlock[],
  tomorrowTasks?: SyncTomorrowTask[],
  settings?: SyncSettings | null
): Promise<PushResponse> {
  const payload: PushPayload = {
    clientId: getClientId(),
  };

  if (blocks && blocks.length > 0) {
    payload.blocks = blocks;
  }

  if (tomorrowTasks && tomorrowTasks.length > 0) {
    payload.tomorrowTasks = tomorrowTasks;
  }

  if (settings !== undefined) {
    payload.settings = settings;
  }

  return fetchApi<PushResponse>("/sync/push", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function pullChanges(since?: string): Promise<PullResponse> {
  const params = since ? `?since=${encodeURIComponent(since)}` : "";
  return fetchApi<PullResponse>(`/sync/pull${params}`);
}

export async function fullSync(): Promise<PullResponse> {
  return fetchApi<PullResponse>("/sync/full");
}

export async function resolveConflict(
  conflictId: string,
  resolution: "kept_local" | "kept_server" | "kept_both"
): Promise<{ success: boolean }> {
  return fetchApi("/sync/resolve-conflict", {
    method: "POST",
    body: JSON.stringify({ conflictId, resolution }),
  });
}

// Calendar
export async function createCalendarEvent(
  blockId: string,
  title: string,
  date: string,
  time: string,
  timezone: string
): Promise<{ eventId: string }> {
  return fetchApi("/calendar/event", {
    method: "POST",
    body: JSON.stringify({ blockId, title, date, time, timezone }),
  });
}

export async function updateCalendarEvent(
  eventId: string,
  title?: string,
  date?: string,
  time?: string,
  timezone?: string
): Promise<{ success: boolean }> {
  return fetchApi("/calendar/event", {
    method: "PATCH",
    body: JSON.stringify({ eventId, title, date, time, timezone }),
  });
}

export async function deleteCalendarEvent(
  eventId: string
): Promise<{ success: boolean }> {
  return fetchApi("/calendar/event", {
    method: "DELETE",
    body: JSON.stringify({ eventId }),
  });
}

// Health check
export async function checkHealth(): Promise<boolean> {
  try {
    const apiUrl = getApiUrl();
    const response = await fetch(`${apiUrl}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
