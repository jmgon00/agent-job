// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import ExcelJS from "exceljs";
import { POST } from "./route";
import { prisma } from "@/lib/db";

let testUserId: string;
const testUserEmail = `test-upload-${Date.now()}@agentjob-test.local`;

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: testUserEmail } });
  testUserId = user.id;
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: testUserId } });
});

afterEach(async () => {
  await prisma.savedJob.deleteMany({ where: { userId: testUserId } });
});

async function buildXlsxBuffer(
  headers: string[],
  rows: (string | number)[][]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function uploadRequest(formData: FormData): Request {
  return new Request("http://localhost/api/jobs/upload", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/jobs/upload", () => {
  it("imports valid rows and reports zero errors", async () => {
    const buffer = await buildXlsxBuffer(
      ["Titulo", "Empresa", "Portal", "Salario", "Link", "Estado"],
      [["Dev", "Acme", "linkedin", "1000", "https://x.com/1", "applied"]]
    );
    const formData = new FormData();
    formData.set("userId", testUserId);
    formData.set("file", new Blob([buffer]), "jobs.xlsx");

    const response = await POST(uploadRequest(formData));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.imported).toBe(1);
    expect(json.errors).toEqual([]);

    const saved = await prisma.savedJob.findMany({ where: { userId: testUserId } });
    expect(saved).toHaveLength(1);
    expect(saved[0].title).toBe("Dev");
    expect(saved[0].link).toBe("https://x.com/1");
  });

  it("imports valid rows and reports invalid ones without failing the request", async () => {
    const buffer = await buildXlsxBuffer(
      ["Titulo", "Empresa", "Portal", "Salario", "Link", "Estado"],
      [
        ["", "Acme", "linkedin", "", "https://x.com/1", ""],
        ["Dev2", "Beta", "bumeran", "", "https://x.com/2", ""],
      ]
    );
    const formData = new FormData();
    formData.set("userId", testUserId);
    formData.set("file", new Blob([buffer]), "jobs.xlsx");

    const response = await POST(uploadRequest(formData));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.imported).toBe(1);
    expect(json.errors).toEqual([{ row: 2, reason: "Falta Titulo" }]);
  });

  it("rejects a missing userId with 400", async () => {
    const buffer = await buildXlsxBuffer(
      ["Titulo", "Empresa", "Portal", "Salario", "Link", "Estado"],
      []
    );
    const formData = new FormData();
    formData.set("file", new Blob([buffer]), "jobs.xlsx");

    const response = await POST(uploadRequest(formData));
    expect(response.status).toBe(400);
  });

  it("rejects a non-.xlsx file with 400", async () => {
    const formData = new FormData();
    formData.set("userId", testUserId);
    formData.set("file", new Blob(["not excel"]), "jobs.txt");

    const response = await POST(uploadRequest(formData));
    expect(response.status).toBe(400);
  });

  it("rejects a file over 5MB with 400 before parsing", async () => {
    const oversized = new Uint8Array(5 * 1024 * 1024 + 1);
    const formData = new FormData();
    formData.set("userId", testUserId);
    formData.set("file", new Blob([oversized]), "jobs.xlsx");

    const response = await POST(uploadRequest(formData));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("El archivo es demasiado grande (maximo 5MB)");
  });
});
