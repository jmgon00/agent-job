import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const baseSchema = z.object({
  userId: z.string().min(1),
  rawProfile: z.string().min(1, "El perfil no puede estar vacio"),
});

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  }

  const parsed = baseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "userId o rawProfile invalido" }, { status: 400 });
  }
  const { userId, rawProfile } = parsed.data;

  try {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { rawProfile },
    });
    return NextResponse.json({ id: user.id, rawProfile: user.rawProfile }, { status: 200 });
  } catch (error) {
    console.error("[PUT /api/profiles/base error]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
