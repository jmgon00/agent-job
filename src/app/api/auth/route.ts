import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { emailSchema } from "@/lib/validators";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  }

  const parsed = emailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Email invalido" }, { status: 400 });
  }

  try {
    const user = await prisma.user.upsert({
      where: { email: parsed.data.email },
      update: {},
      create: { email: parsed.data.email },
    });
    return NextResponse.json({ id: user.id, email: user.email }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/auth error]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
