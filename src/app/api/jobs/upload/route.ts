import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseExcelRows } from "@/lib/excel-parser";

export async function POST(request: Request) {
  const formData = await request.formData();
  const userId = formData.get("userId");
  const file = formData.get("file");

  if (typeof userId !== "string" || !userId) {
    return NextResponse.json({ error: "Falta userId" }, { status: 400 });
  }

  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json(
      { error: "Solo se aceptan archivos .xlsx" },
      { status: 400 }
    );
  }

  let result;
  try {
    const arrayBuffer = await file.arrayBuffer();
    result = await parseExcelRows(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error("[POST /api/jobs/upload parse error]", error);
    return NextResponse.json(
      { error: "No se pudo leer el archivo" },
      { status: 500 }
    );
  }

  try {
    if (result.valid.length > 0) {
      await prisma.savedJob.createMany({
        data: result.valid.map((row) => ({
          title: row.title,
          company: row.company,
          portal: row.portal,
          salary: row.salary,
          link: row.link,
          status: row.status,
          userId,
        })),
      });
    }
    return NextResponse.json(
      { imported: result.valid.length, errors: result.errors },
      { status: 200 }
    );
  } catch (error) {
    console.error("[POST /api/jobs/upload db error]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
