import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAccessToken, createCalendarEvent, deleteCalendarEvent } from "@/lib/google-calendar";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = await getAccessToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json({ error: "No calendar access" }, { status: 403 });
  }

  const { task, time, date } = await req.json();

  if (!task || !time) {
    return NextResponse.json({ error: "Missing task or time" }, { status: 400 });
  }

  // Parse time (HH:MM) and create event
  const [hours, minutes] = time.split(":").map(Number);
  const eventDate = date ? new Date(date) : new Date();
  eventDate.setHours(hours, minutes, 0, 0);

  // Event duration: 30 minutes by default
  const endDate = new Date(eventDate);
  endDate.setMinutes(endDate.getMinutes() + 30);

  const result = await createCalendarEvent(accessToken, {
    summary: task,
    start: eventDate,
    end: endDate,
    reminders: [10], // 10 minutes before
  });

  if (!result) {
    return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  }

  return NextResponse.json({ eventId: result.id });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = await getAccessToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json({ error: "No calendar access" }, { status: 403 });
  }

  const { eventId } = await req.json();

  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
  }

  const success = await deleteCalendarEvent(accessToken, eventId);

  if (!success) {
    return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
