"use client";

import { useRef, useCallback } from "react";
import { Block, parseTimeTag } from "@/lib/types";

interface CalendarSyncOptions {
  enabled: boolean;
  onBlockUpdate: (blockId: string, calendarEventId: string | undefined) => void;
}

export function useCalendarSync({ enabled, onBlockUpdate }: CalendarSyncOptions) {
  const pendingSyncsRef = useRef<Set<string>>(new Set());

  const syncBlock = useCallback(
    async (block: Block, previousBlock: Block | undefined) => {
      if (!enabled) return;

      // Prevent duplicate syncs
      if (pendingSyncsRef.current.has(block.id)) return;

      const timeTag = parseTimeTag(block.text);
      const hadTimeTag = previousBlock && parseTimeTag(previousBlock.text);

      // Case 1: New time tag added, no existing calendar event
      if (timeTag && !block.calendarEventId) {
        pendingSyncsRef.current.add(block.id);
        try {
          const response = await fetch("/api/calendar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              task: timeTag.task,
              time: timeTag.time,
              date: new Date(block.createdAt).toISOString().split("T")[0],
            }),
          });

          if (response.ok) {
            const { eventId } = await response.json();
            onBlockUpdate(block.id, eventId);
          }
        } catch (err) {
          console.error("Failed to create calendar event:", err);
        } finally {
          pendingSyncsRef.current.delete(block.id);
        }
        return;
      }

      // Case 2: Time tag removed but calendar event exists
      if (!timeTag && block.calendarEventId) {
        pendingSyncsRef.current.add(block.id);
        try {
          await fetch("/api/calendar", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventId: block.calendarEventId }),
          });
          onBlockUpdate(block.id, undefined);
        } catch (err) {
          console.error("Failed to delete calendar event:", err);
        } finally {
          pendingSyncsRef.current.delete(block.id);
        }
        return;
      }

      // Case 3: Time tag changed - delete old, create new
      if (timeTag && block.calendarEventId && hadTimeTag) {
        const prevTimeTag = parseTimeTag(previousBlock.text);
        if (prevTimeTag && (prevTimeTag.time !== timeTag.time || prevTimeTag.task !== timeTag.task)) {
          pendingSyncsRef.current.add(block.id);
          try {
            // Delete old event
            await fetch("/api/calendar", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ eventId: block.calendarEventId }),
            });

            // Create new event
            const response = await fetch("/api/calendar", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                task: timeTag.task,
                time: timeTag.time,
                date: new Date(block.createdAt).toISOString().split("T")[0],
              }),
            });

            if (response.ok) {
              const { eventId } = await response.json();
              onBlockUpdate(block.id, eventId);
            } else {
              onBlockUpdate(block.id, undefined);
            }
          } catch (err) {
            console.error("Failed to update calendar event:", err);
          } finally {
            pendingSyncsRef.current.delete(block.id);
          }
        }
      }
    },
    [enabled, onBlockUpdate]
  );

  const deleteEvent = useCallback(
    async (calendarEventId: string) => {
      if (!enabled || !calendarEventId) return;

      try {
        await fetch("/api/calendar", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId: calendarEventId }),
        });
      } catch (err) {
        console.error("Failed to delete calendar event:", err);
      }
    },
    [enabled]
  );

  return { syncBlock, deleteEvent };
}
