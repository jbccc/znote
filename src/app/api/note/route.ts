import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const note = await prisma.note.findUnique({
    where: { userId: session.user.id },
  });

  return NextResponse.json({ content: note?.content ?? "" });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { content } = await req.json();

  await prisma.note.upsert({
    where: { userId: session.user.id },
    update: { content },
    create: { userId: session.user.id, content },
  });

  return NextResponse.json({ success: true });
}
