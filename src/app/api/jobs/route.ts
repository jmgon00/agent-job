import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "Falta userId" }, { status: 400 });
  }

  try {
    const jobs = await prisma.savedJob.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ jobs }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/jobs error]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
