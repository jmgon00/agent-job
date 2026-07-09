import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "Falta userId" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const profiles = await prisma.userProfile.findMany({ where: { userId } });
    return NextResponse.json(
      { rawProfile: user.rawProfile, profiles },
      { status: 200 }
    );
  } catch (error) {
    console.error("[GET /api/profiles error]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
