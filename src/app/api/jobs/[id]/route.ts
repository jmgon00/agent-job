import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { JOB_STATUSES } from "@/lib/job-status";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: { userId?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  }

  const { userId, status } = body;

  if (typeof userId !== "string" || !userId) {
    return NextResponse.json({ error: "Falta userId" }, { status: 400 });
  }

  if (typeof status !== "string" || !JOB_STATUSES.includes(status as (typeof JOB_STATUSES)[number])) {
    return NextResponse.json({ error: "Estado invalido" }, { status: 400 });
  }

  try {
    const job = await prisma.savedJob.findUnique({ where: { id } });
    if (!job || job.userId !== userId) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const updated = await prisma.savedJob.update({
      where: { id },
      data: { status },
    });
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error("[PATCH /api/jobs/[id] error]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
