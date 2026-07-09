import ExcelJS from "exceljs";
import { z } from "zod";

export interface ParsedJobRow {
  title: string;
  company: string;
  portal: string;
  salary: string | null;
  link: string;
  status: string;
}

export interface ParseError {
  row: number;
  reason: string;
}

export interface ParseResult {
  valid: ParsedJobRow[];
  errors: ParseError[];
}

const rowSchema = z.object({
  title: z.string().min(1, "Falta Titulo"),
  company: z.string().min(1, "Falta Empresa"),
  portal: z.string().min(1, "Falta Portal"),
  link: z.string().min(1, "Falta Link"),
});

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("text" in value) {
      return String((value as { text: unknown }).text ?? "").trim();
    }
    if ("result" in value) {
      return String((value as { result: unknown }).result ?? "").trim();
    }
    return "";
  }
  return String(value).trim();
}

export async function parseExcelRows(buffer: Buffer): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const worksheet = workbook.worksheets[0];

  const valid: ParsedJobRow[] = [];
  const errors: ParseError[] = [];

  if (!worksheet) {
    return { valid, errors };
  }

  const headerRow = worksheet.getRow(1);
  const columnIndex: Record<string, number> = {};
  headerRow.eachCell((cell, colNumber) => {
    const value = cellToString(cell.value);
    if (value) columnIndex[value] = colNumber;
  });

  const totalRows = worksheet.rowCount;
  for (let rowNumber = 2; rowNumber <= totalRows; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;

    const getCell = (header: string): string => {
      const colNumber = columnIndex[header];
      if (!colNumber) return "";
      return cellToString(row.getCell(colNumber).value);
    };

    const title = getCell("Titulo");
    const company = getCell("Empresa");
    const portal = getCell("Portal");
    const salary = getCell("Salario");
    const link = getCell("Link");
    const status = getCell("Estado");

    if (!title && !company && !portal && !link) {
      continue;
    }

    const parsed = rowSchema.safeParse({ title, company, portal, link });
    if (!parsed.success) {
      errors.push({ row: rowNumber, reason: parsed.error.issues[0].message });
      continue;
    }

    valid.push({
      title: parsed.data.title,
      company: parsed.data.company,
      portal: parsed.data.portal,
      salary: salary || null,
      link: parsed.data.link,
      status: status || "saved",
    });
  }

  return { valid, errors };
}
