import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  verifyGoogleToken,
  createToken,
  authMiddleware,
  AuthenticatedRequest,
} from "../middleware/auth.js";

const router = Router();

const signInSchema = z.object({
  idToken: z.string(),
  refreshToken: z.string().optional(),
});

// For trusted internal auth (when NextAuth already verified the user)
const internalAuthSchema = z.object({
  googleId: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  image: z.string().nullable().optional(),
  refreshToken: z.string().nullable().optional(),
});

// POST /auth/google - Sign in with Google
router.post("/google", async (req, res) => {
  try {
    const { idToken, refreshToken } = signInSchema.parse(req.body);

    const googleUser = await verifyGoogleToken(idToken);

    // Upsert user
    const user = await prisma.user.upsert({
      where: { googleId: googleUser.googleId },
      update: {
        email: googleUser.email,
        name: googleUser.name,
        image: googleUser.image,
        refreshToken: refreshToken || undefined,
      },
      create: {
        googleId: googleUser.googleId,
        email: googleUser.email,
        name: googleUser.name,
        image: googleUser.image,
        refreshToken: refreshToken || null,
      },
    });

    const token = createToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      },
    });
  } catch (error) {
    console.error("Auth error:", error);
    res.status(401).json({ error: "Authentication failed" });
  }
});

// POST /auth/internal - Auth for trusted sources (NextAuth bridge)
// In production, this should be protected by an internal API key
router.post("/internal", async (req, res) => {
  try {
    const { googleId, email, name, image, refreshToken } = internalAuthSchema.parse(req.body);

    // Upsert user
    const user = await prisma.user.upsert({
      where: { googleId },
      update: {
        email,
        name,
        image: image || null,
        refreshToken: refreshToken || undefined,
      },
      create: {
        googleId,
        email,
        name,
        image: image || null,
        refreshToken: refreshToken || null,
      },
    });

    const token = createToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      },
    });
  } catch (error) {
    console.error("Internal auth error:", error);
    res.status(400).json({ error: "Authentication failed" });
  }
});

// GET /auth/me - Get current user
router.get("/me", authMiddleware, async (req, res) => {
  const { userId } = req as AuthenticatedRequest;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
    },
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ user });
});

export default router;
