// API client for the sync server (React Native version)

import type {
  PushPayload,
  PushResponse,
  PullResponse,
  SyncBlock,
  SyncTomorrowTask,
  SyncSettings,
} from "./types";
import { getAuthToken, getClientId, getApiUrl } from "./storage";

async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAuthToken();
  const apiUrl = await getApiUrl();

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
  const clientId = await getClientId();
  const payload: PushPayload = { clientId };

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

// Health check
export async function checkHealth(): Promise<boolean> {
  try {
    const apiUrl = await getApiUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${apiUrl}/health`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}
