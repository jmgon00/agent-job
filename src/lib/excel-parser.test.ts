import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseExcelRows } from "./excel-parser";

async function buildWorkbookBuffer(
  headers: string[],
  rows: (string | number)[][]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(row);
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe("parseExcelRows", () => {
  it("parses well-formed rows", async () => {
    const buffer = await buildWorkbookBuffer(
      ["Titulo", "Empresa", "Portal", "Salario", "Link", "Estado"],
      [["Dev", "Acme", "linkedin", "1000", "https://x.com/1", "applied"]]
    );
    const result = await parseExcelRows(buffer);
    expect(result.errors).toEqual([]);
    expect(result.valid).toEqual([
      {
        title: "Dev",
        company: "Acme",
        portal: "linkedin",
        salary: "1000",
        link: "https://x.com/1",
        status: "applied",
      },
    ]);
  });

  it("defaults status to saved and salary to null when blank", async () => {
    const buffer = await buildWorkbookBuffer(
      ["Titulo", "Empresa", "Portal", "Salario", "Link", "Estado"],
      [["Dev", "Acme", "linkedin", "", "https://x.com/1", ""]]
    );
    const result = await parseExcelRows(buffer);
    expect(result.valid[0].status).toBe("saved");
    expect(result.valid[0].salary).toBeNull();
  });

  it("reports a row missing Titulo as an error, not fatal", async () => {
    const buffer = await buildWorkbookBuffer(
      ["Titulo", "Empresa", "Portal", "Salario", "Link", "Estado"],
      [
        ["", "Acme", "linkedin", "", "https://x.com/1", ""],
        ["Dev", "Beta", "bumeran", "", "https://x.com/2", ""],
      ]
    );
    const result = await parseExcelRows(buffer);
    expect(result.valid).toHaveLength(1);
    expect(result.errors).toEqual([{ row: 2, reason: "Falta Titulo" }]);
  });

  it("works with columns in a different order", async () => {
    const buffer = await buildWorkbookBuffer(
      ["Link", "Titulo", "Portal", "Empresa"],
      [["https://x.com/1", "Dev", "linkedin", "Acme"]]
    );
    const result = await parseExcelRows(buffer);
    expect(result.errors).toEqual([]);
    expect(result.valid).toEqual([
      {
        title: "Dev",
        company: "Acme",
        portal: "linkedin",
        salary: null,
        link: "https://x.com/1",
        status: "saved",
      },
    ]);
  });

  it("skips fully blank rows silently", async () => {
    const buffer = await buildWorkbookBuffer(
      ["Titulo", "Empresa", "Portal", "Salario", "Link", "Estado"],
      [
        ["Dev", "Acme", "linkedin", "", "https://x.com/1", ""],
        [],
        ["Dev2", "Beta", "bumeran", "", "https://x.com/2", ""],
      ]
    );
    const result = await parseExcelRows(buffer);
    expect(result.errors).toEqual([]);
    expect(result.valid).toHaveLength(2);
  });

  it("returns empty valid/errors for a header-only sheet", async () => {
    const buffer = await buildWorkbookBuffer(
      ["Titulo", "Empresa", "Portal", "Salario", "Link", "Estado"],
      []
    );
    const result = await parseExcelRows(buffer);
    expect(result).toEqual({ valid: [], errors: [] });
  });

  it("extracts the URL from a hyperlink-formatted Link cell", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");
    sheet.addRow(["Titulo", "Empresa", "Portal", "Salario", "Link", "Estado"]);
    const row = sheet.addRow(["Dev", "Acme", "linkedin", "", "", ""]);
    row.getCell(5).value = {
      text: "https://x.com/1",
      hyperlink: "https://x.com/1",
    };
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const result = await parseExcelRows(buffer);
    expect(result.errors).toEqual([]);
    expect(result.valid[0].link).toBe("https://x.com/1");
  });
});
