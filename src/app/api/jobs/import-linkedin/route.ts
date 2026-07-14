import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseLinkedInHtml } from "@/lib/linkedin-parser";

const MAX_HTML_LENGTH = 2 * 1024 * 1024; // 2MB

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const userId = body?.userId;
  const html = body?.html;

  if (typeof userId !== "string" || !userId) {
    return NextResponse.json({ error: "Falta userId" }, { status: 400 });
  }

  if (typeof html !== "string" || !html) {
    return NextResponse.json({ error: "Falta html" }, { status: 400 });
  }

  if (html.length > MAX_HTML_LENGTH) {
    return NextResponse.json(
      { error: "El HTML pegado es demasiado grande" },
      { status: 400 }
    );
  }

  let parsed;
  try {
    parsed = parseLinkedInHtml(html);
  } catch (error) {
    console.error("[POST /api/jobs/import-linkedin parse error]", error);
    return NextResponse.json(
      { error: "No se pudo leer el HTML pegado" },
      { status: 500 }
    );
  }

  try {
    const links = parsed.jobs.map((job) => job.link);
    const existing = links.length
      ? await prisma.savedJob.findMany({
          where: { userId, link: { in: links } },
          select: { link: true },
        })
      : [];
    const existingLinks = new Set(existing.map((job) => job.link));

    const newJobs = parsed.jobs.filter((job) => !existingLinks.has(job.link));
    const duplicates = parsed.jobs.length - newJobs.length;

    if (newJobs.length > 0) {
      await prisma.savedJob.createMany({
        data: newJobs.map((job) => ({
          title: job.title,
          company: job.company,
          location: job.location,
          portal: "LinkedIn",
          salary: job.salary,
          link: job.link,
          status: "saved",
          userId,
        })),
      });
    }

    return NextResponse.json(
      {
        imported: newJobs.length,
        duplicates,
        unrecognizedCount: parsed.unrecognizedCount,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[POST /api/jobs/import-linkedin db error]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
