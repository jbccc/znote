import { prisma } from "./db";

interface CalendarEvent {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  reminders?: number[]; // minutes before event
}

async function refreshAccessToken(account: {
  refresh_token: string | null;
  access_token: string | null;
  expires_at: number | null;
  id: string;
}): Promise<string | null> {
  if (!account.refresh_token) return account.access_token;

  // Check if token is still valid (with 5 min buffer)
  const expiresAt = account.expires_at ? account.expires_at * 1000 : 0;
  if (expiresAt > Date.now() + 5 * 60 * 1000) {
    return account.access_token;
  }

  // Refresh the token
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
  });

  const tokens = await response.json();

  if (!response.ok) {
    console.error("Failed to refresh token:", tokens);
    return null;
  }

  // Update the account in database
  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: tokens.access_token,
      expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
      ...(tokens.refresh_token && { refresh_token: tokens.refresh_token }),
    },
  });

  return tokens.access_token;
}

export async function getAccessToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });

  if (!account) return null;

  return refreshAccessToken(account);
}

export async function createCalendarEvent(
  accessToken: string,
  event: CalendarEvent
): Promise<{ id: string } | null> {
  const calendarEvent = {
    summary: event.summary,
    description: event.description,
    start: {
      dateTime: event.start.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      dateTime: event.end.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    reminders: {
      useDefault: false,
      overrides: (event.reminders || [10]).map((minutes) => ({
        method: "popup",
        minutes,
      })),
    },
  };

  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(calendarEvent),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    console.error("Failed to create calendar event:", error);
    return null;
  }

  return response.json();
}

export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<boolean> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  return response.ok || response.status === 404;
}
