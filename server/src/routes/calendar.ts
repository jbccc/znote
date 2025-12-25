import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import { OAuth2Client } from "google-auth-library";

const router = Router();

router.use(authMiddleware);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

async function getAccessToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { refreshToken: true },
  });

  if (!user?.refreshToken) {
    return null;
  }

  const oauth2Client = new OAuth2Client(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: user.refreshToken,
  });

  const { credentials } = await oauth2Client.refreshAccessToken();
  return credentials.access_token || null;
}

const createEventSchema = z.object({
  blockId: z.string(),
  title: z.string(),
  date: z.string(), // YYYY-MM-DD
  time: z.string(), // HH:MM
  timezone: z.string(),
});

// POST /calendar/event - Create calendar event
router.post("/event", async (req, res) => {
  const { userId } = req as AuthenticatedRequest;

  try {
    const { blockId, title, date, time, timezone } = createEventSchema.parse(
      req.body
    );

    const accessToken = await getAccessToken(userId);
    if (!accessToken) {
      res.status(401).json({ error: "No calendar access" });
      return;
    }

    const [hours, minutes] = time.split(":").map(Number);
    const startDateTime = new Date(`${date}T${time}:00`);
    const endDateTime = new Date(startDateTime.getTime() + 30 * 60 * 1000); // 30 min

    const event = {
      summary: title,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: timezone,
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: timezone,
      },
      reminders: {
        useDefault: false,
        overrides: [{ method: "popup", minutes: 10 }],
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
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Calendar API error:", error);
      res.status(response.status).json({ error: "Calendar API error" });
      return;
    }

    const created = await response.json();

    // Update block with calendar event ID
    await prisma.block.update({
      where: { id: blockId },
      data: { calendarEventId: created.id },
    });

    res.json({ eventId: created.id });
  } catch (error) {
    console.error("Create event error:", error);
    res.status(400).json({ error: "Failed to create event" });
  }
});

const updateEventSchema = z.object({
  eventId: z.string(),
  title: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  timezone: z.string(),
});

// PATCH /calendar/event - Update calendar event
router.patch("/event", async (req, res) => {
  const { userId } = req as AuthenticatedRequest;

  try {
    const { eventId, title, date, time, timezone } = updateEventSchema.parse(
      req.body
    );

    const accessToken = await getAccessToken(userId);
    if (!accessToken) {
      res.status(401).json({ error: "No calendar access" });
      return;
    }

    const updates: Record<string, unknown> = {};

    if (title) {
      updates.summary = title;
    }

    if (date && time) {
      const startDateTime = new Date(`${date}T${time}:00`);
      const endDateTime = new Date(startDateTime.getTime() + 30 * 60 * 1000);
      updates.start = { dateTime: startDateTime.toISOString(), timeZone: timezone };
      updates.end = { dateTime: endDateTime.toISOString(), timeZone: timezone };
    }

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      }
    );

    if (!response.ok) {
      res.status(response.status).json({ error: "Calendar API error" });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Update event error:", error);
    res.status(400).json({ error: "Failed to update event" });
  }
});

const deleteEventSchema = z.object({
  eventId: z.string(),
});

// DELETE /calendar/event - Delete calendar event
router.delete("/event", async (req, res) => {
  const { userId } = req as AuthenticatedRequest;

  try {
    const { eventId } = deleteEventSchema.parse(req.body);

    const accessToken = await getAccessToken(userId);
    if (!accessToken) {
      res.status(401).json({ error: "No calendar access" });
      return;
    }

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    // 404 is ok - event might already be deleted
    if (!response.ok && response.status !== 404) {
      res.status(response.status).json({ error: "Calendar API error" });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Delete event error:", error);
    res.status(400).json({ error: "Failed to delete event" });
  }
});

export default router;
