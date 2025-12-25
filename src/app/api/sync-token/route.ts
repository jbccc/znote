import { auth } from "@/auth";
import { prisma } from "@/lib/db";

// This endpoint bridges NextAuth sessions with the sync server
// It returns user info that can be used to authenticate with the sync server
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get the user's Google account info
  const account = await prisma.account.findFirst({
    where: {
      userId: session.user.id,
      provider: "google",
    },
    select: {
      providerAccountId: true,
      refresh_token: true,
    },
  });

  if (!account) {
    return Response.json({ error: "No Google account linked" }, { status: 400 });
  }

  // Return info needed for sync server auth
  return Response.json({
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
      googleId: account.providerAccountId,
    },
    refreshToken: account.refresh_token,
  });
}
