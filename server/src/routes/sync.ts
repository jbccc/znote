import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

router.use(authMiddleware);

const blockChangeSchema = z.object({
  id: z.string(),
  text: z.string(),
  createdAt: z.string().datetime(),
  calendarEventId: z.string().nullable().optional(),
  position: z.number().default(0),
  version: z.number(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable().optional(),
  clientId: z.string().optional(),
});

const tomorrowTaskChangeSchema = z.object({
  id: z.string(),
  text: z.string(),
  time: z.string().nullable().optional(),
  position: z.number().default(0),
  version: z.number(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable().optional(),
  clientId: z.string().optional(),
});

const settingsChangeSchema = z.object({
  theme: z.enum(["system", "light", "dark"]).default("system"),
  dayCutHour: z.number().min(0).max(23).default(4),
  updatedAt: z.string().datetime(),
});

const pushSchema = z.object({
  blocks: z.array(blockChangeSchema).optional(),
  tomorrowTasks: z.array(tomorrowTaskChangeSchema).optional(),
  settings: settingsChangeSchema.nullable().optional(),
  clientId: z.string(),
});

// POST /sync/push - Push local changes to server (optimized batch version)
router.post("/push", async (req, res) => {
  const { userId } = req as AuthenticatedRequest;

  try {
    const { blocks, tomorrowTasks, settings, clientId } = pushSchema.parse(req.body);

    const conflicts: Array<{
      type: "block" | "tomorrowTask";
      id: string;
      localVersion: number;
      serverVersion: number;
    }> = [];

    const applied: {
      blocks: string[];
      tomorrowTasks: string[];
      settings: boolean;
    } = { blocks: [], tomorrowTasks: [], settings: false };

    // Process all in a single transaction
    await prisma.$transaction(async (tx) => {
      // Process blocks
      if (blocks && blocks.length > 0) {
        const blockIds = blocks.map((b) => b.id);

        // Batch fetch existing blocks
        const existing = await tx.block.findMany({
          where: { id: { in: blockIds } },
        });
        const existingMap = new Map(existing.map((b) => [b.id, b]));

        const toCreate: Array<{
          id: string;
          userId: string;
          text: string;
          createdAt: Date;
          calendarEventId?: string | null;
          position: number;
          version: number;
          deletedAt: Date | null;
          clientId?: string;
        }> = [];
        const toUpdate: Array<{ id: string; data: Parameters<typeof tx.block.update>[0]["data"] }> = [];

        for (const block of blocks) {
          const ex = existingMap.get(block.id);

          if (ex && ex.userId !== userId) continue;

          if (ex) {
            // Conflict check
            if (ex.version >= block.version && ex.clientId !== clientId) {
              conflicts.push({
                type: "block",
                id: block.id,
                localVersion: block.version,
                serverVersion: ex.version,
              });

              // Create duplicate for "keep both"
              toCreate.push({
                id: `${block.id}-conflict-${Date.now()}`,
                userId,
                text: `[Conflict] ${block.text}`,
                createdAt: new Date(block.createdAt),
                calendarEventId: block.calendarEventId,
                position: block.position + 1,
                version: 1,
                deletedAt: block.deletedAt ? new Date(block.deletedAt) : null,
                clientId,
              });
              continue;
            }

            toUpdate.push({
              id: block.id,
              data: {
                text: block.text,
                calendarEventId: block.calendarEventId,
                position: block.position,
                version: block.version + 1,
                deletedAt: block.deletedAt ? new Date(block.deletedAt) : null,
                clientId,
              },
            });
          } else {
            toCreate.push({
              id: block.id,
              userId,
              text: block.text,
              createdAt: new Date(block.createdAt),
              calendarEventId: block.calendarEventId,
              position: block.position,
              version: 1,
              deletedAt: block.deletedAt ? new Date(block.deletedAt) : null,
              clientId,
            });
          }
          applied.blocks.push(block.id);
        }

        // Batch create
        if (toCreate.length > 0) {
          await tx.block.createMany({ data: toCreate });
        }

        // Updates must be individual (Prisma limitation)
        await Promise.all(
          toUpdate.map((u) => tx.block.update({ where: { id: u.id }, data: u.data }))
        );
      }

      // Process tomorrow tasks (same pattern)
      if (tomorrowTasks && tomorrowTasks.length > 0) {
        const taskIds = tomorrowTasks.map((t) => t.id);

        const existing = await tx.tomorrowTask.findMany({
          where: { id: { in: taskIds } },
        });
        const existingMap = new Map(existing.map((t) => [t.id, t]));

        const toCreate: Array<{
          id: string;
          userId: string;
          text: string;
          time?: string | null;
          position: number;
          version: number;
          deletedAt: Date | null;
          clientId?: string;
        }> = [];
        const toUpdate: Array<{ id: string; data: Parameters<typeof tx.tomorrowTask.update>[0]["data"] }> = [];

        for (const task of tomorrowTasks) {
          const ex = existingMap.get(task.id);

          if (ex && ex.userId !== userId) continue;

          if (ex) {
            if (ex.version >= task.version && ex.clientId !== clientId) {
              conflicts.push({
                type: "tomorrowTask",
                id: task.id,
                localVersion: task.version,
                serverVersion: ex.version,
              });
              continue;
            }

            toUpdate.push({
              id: task.id,
              data: {
                text: task.text,
                time: task.time,
                position: task.position,
                version: task.version + 1,
                deletedAt: task.deletedAt ? new Date(task.deletedAt) : null,
                clientId,
              },
            });
          } else {
            toCreate.push({
              id: task.id,
              userId,
              text: task.text,
              time: task.time,
              position: task.position,
              version: 1,
              deletedAt: task.deletedAt ? new Date(task.deletedAt) : null,
              clientId,
            });
          }
          applied.tomorrowTasks.push(task.id);
        }

        if (toCreate.length > 0) {
          await tx.tomorrowTask.createMany({ data: toCreate });
        }

        await Promise.all(
          toUpdate.map((u) => tx.tomorrowTask.update({ where: { id: u.id }, data: u.data }))
        );
      }

      // Settings
      if (settings) {
        await tx.settings.upsert({
          where: { userId },
          update: { theme: settings.theme, dayCutHour: settings.dayCutHour },
          create: { userId, theme: settings.theme, dayCutHour: settings.dayCutHour },
        });
        applied.settings = true;
      }
    });

    res.json({ success: true, applied, conflicts });
  } catch (error) {
    console.error("Push error:", error);
    res.status(400).json({ error: "Invalid push data" });
  }
});

// GET /sync/pull - Pull changes since timestamp
router.get("/pull", async (req, res) => {
  const { userId } = req as AuthenticatedRequest;
  const since = req.query.since as string | undefined;

  try {
    const sinceDate = since ? new Date(since) : new Date(0);

    // Parallel queries
    const [blocks, tomorrowTasks, settings] = await Promise.all([
      prisma.block.findMany({
        where: { userId, updatedAt: { gt: sinceDate } },
        orderBy: [{ createdAt: "asc" }, { position: "asc" }],
      }),
      prisma.tomorrowTask.findMany({
        where: { userId, updatedAt: { gt: sinceDate } },
        orderBy: { position: "asc" },
      }),
      prisma.settings.findUnique({ where: { userId } }),
    ]);

    res.json({
      blocks: blocks.map((b) => ({
        id: b.id,
        text: b.text,
        createdAt: b.createdAt.toISOString(),
        calendarEventId: b.calendarEventId,
        position: b.position,
        version: b.version,
        updatedAt: b.updatedAt.toISOString(),
        deletedAt: b.deletedAt?.toISOString() || null,
        clientId: b.clientId,
      })),
      tomorrowTasks: tomorrowTasks.map((t) => ({
        id: t.id,
        text: t.text,
        time: t.time,
        position: t.position,
        version: t.version,
        updatedAt: t.updatedAt.toISOString(),
        deletedAt: t.deletedAt?.toISOString() || null,
        clientId: t.clientId,
      })),
      settings: settings
        ? {
            theme: settings.theme,
            dayCutHour: settings.dayCutHour,
            updatedAt: settings.updatedAt.toISOString(),
          }
        : null,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Pull error:", error);
    res.status(500).json({ error: "Pull failed" });
  }
});

// GET /sync/full - Full sync
router.get("/full", async (req, res) => {
  const { userId } = req as AuthenticatedRequest;

  try {
    // Parallel queries
    const [blocks, tomorrowTasks, settings] = await Promise.all([
      prisma.block.findMany({
        where: { userId, deletedAt: null },
        orderBy: [{ createdAt: "asc" }, { position: "asc" }],
      }),
      prisma.tomorrowTask.findMany({
        where: { userId, deletedAt: null },
        orderBy: { position: "asc" },
      }),
      prisma.settings.findUnique({ where: { userId } }),
    ]);

    res.json({
      blocks: blocks.map((b) => ({
        id: b.id,
        text: b.text,
        createdAt: b.createdAt.toISOString(),
        calendarEventId: b.calendarEventId,
        position: b.position,
        version: b.version,
        updatedAt: b.updatedAt.toISOString(),
      })),
      tomorrowTasks: tomorrowTasks.map((t) => ({
        id: t.id,
        text: t.text,
        time: t.time,
        position: t.position,
        version: t.version,
        updatedAt: t.updatedAt.toISOString(),
      })),
      settings: settings
        ? {
            theme: settings.theme,
            dayCutHour: settings.dayCutHour,
            updatedAt: settings.updatedAt.toISOString(),
          }
        : null,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Full sync error:", error);
    res.status(500).json({ error: "Full sync failed" });
  }
});

// POST /sync/resolve-conflict
router.post("/resolve-conflict", async (req, res) => {
  const { userId } = req as AuthenticatedRequest;

  const schema = z.object({
    conflictId: z.string(),
    resolution: z.enum(["kept_local", "kept_server", "kept_both"]),
  });

  try {
    const { conflictId, resolution } = schema.parse(req.body);

    const conflict = await prisma.conflict.findUnique({
      where: { id: conflictId },
    });

    if (!conflict || conflict.userId !== userId) {
      res.status(404).json({ error: "Conflict not found" });
      return;
    }

    await prisma.conflict.update({
      where: { id: conflictId },
      data: { resolvedAt: new Date(), resolution },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Resolve conflict error:", error);
    res.status(400).json({ error: "Invalid request" });
  }
});

export default router;
