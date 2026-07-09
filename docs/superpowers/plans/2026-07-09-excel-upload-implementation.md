# Excel Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authenticated user upload an `.xlsx` file of job postings and create one `SavedJob` row per valid row, scoped to that user, per the approved design spec.

**Architecture:** A pure parsing function (`parseExcelRows`) turns an Excel buffer into `{valid, errors}` with no DB/network involved, independently unit-tested. A `POST /api/jobs/upload` route accepts `multipart/form-data` (`file` + `userId`), calls the parser, bulk-creates the valid rows via Prisma, and returns a summary. A client page (`/upload`) provides the file input and renders the summary.

**Tech Stack:** `exceljs` (new dependency) for `.xlsx` parsing, Zod for per-row validation, Prisma `SavedJob.createMany`, Vitest (already set up) for both a pure unit-test suite and a live-DB integration test.

## Global Constraints

- Library is `exceljs`, not `xlsx`/SheetJS (security rationale in the design spec).
- Expected header row (exact Spanish names, case-sensitive, any column order): `Titulo`, `Empresa`, `Portal`, `Salario` (optional), `Link`, `Estado` (optional, defaults to `"saved"`).
- Only `.xlsx` — no `.xls`/`.csv`.
- No deduplication against existing `SavedJob` rows.
- The endpoint trusts a client-supplied `userId` directly (no re-verification) — same MVP security model established by the auth feature. It is NOT this endpoint's job to create/verify users.
- A row missing a required field (`Titulo`/`Empresa`/`Portal`/`Link`) is recorded as a per-row error and skipped — it does NOT fail the whole request. A totally unparseable file (corrupt `.xlsx`) DOES fail the whole request with `500`.
- Any test that writes to the live database MUST clean up the rows it created (scoped deletes only — this is a shared real database, not a disposable test instance).
- Commit messages must end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: `parseExcelRows` (pure function, unit-tested)

**Files:**
- Modify: `package.json` (add `exceljs` dependency)
- Create: `src/lib/excel-parser.ts`
- Create: `src/lib/excel-parser.test.ts`

**Interfaces:**
- Produces: `ParsedJobRow` (`{title, company, portal, salary: string | null, link, status}`), `ParseError` (`{row: number, reason: string}`), `ParseResult` (`{valid: ParsedJobRow[], errors: ParseError[]}`), and `parseExcelRows(buffer: Buffer): Promise<ParseResult>` — exported from `@/lib/excel-parser`, consumed by Task 2's route.

- [ ] **Step 1: Add `exceljs` to `package.json` dependencies**

Add to `dependencies` (alongside the existing entries — do not remove or reorder others):

```json
"exceljs": "^4.4.0"
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: exit 0, `exceljs` appears under `node_modules`.

- [ ] **Step 3: Write the failing tests — `src/lib/excel-parser.test.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests and confirm they fail**

Run: `npx vitest run src/lib/excel-parser.test.ts`
Expected: FAIL — `src/lib/excel-parser.ts` does not exist yet.

- [ ] **Step 5: Implement `src/lib/excel-parser.ts`**

```ts
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
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/excel-parser.test.ts`
Expected: PASS, 7/7 tests green.

If a specific case doesn't pass on the first try (e.g. the blank-row-skip or hyperlink-extraction logic), adjust `excel-parser.ts` until it does — the tests above are the source of truth for behavior, not the draft implementation. Do not change the tests to match a wrong implementation.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/excel-parser.ts src/lib/excel-parser.test.ts
git commit -m "$(cat <<'EOF'
feat: add Excel row parser

parseExcelRows turns an .xlsx buffer into {valid, errors} with no DB
or network involved. Handles column reordering, blank rows, missing
optional fields, and hyperlink-formatted Link cells.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `POST /api/jobs/upload` route (live-DB integration test)

**Files:**
- Create: `src/app/api/jobs/upload/route.ts`
- Create: `src/app/api/jobs/upload/route.test.ts`

**Interfaces:**
- Consumes: `parseExcelRows` from `@/lib/excel-parser` (Task 1), `prisma` from `@/lib/db`.
- Produces: `POST` handler returning `200 {imported: number, errors: ParseError[]}` on success, `400 {error: string}` for a missing `userId` or non-`.xlsx` file, `500 {error: string}` for an unparseable file or DB error.

This test hits the live Neon database. It needs a real `User` row to satisfy `SavedJob`'s foreign key — create one in `beforeAll` (unique `@agentjob-test.local` email), delete it in `afterAll`, and delete any `SavedJob` rows created by each test in `afterEach`.

- [ ] **Step 1: Write the failing tests — `src/app/api/jobs/upload/route.test.ts`**

```ts
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
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/app/api/jobs/upload/route.test.ts`
Expected: FAIL — `src/app/api/jobs/upload/route.ts` does not exist yet.

- [ ] **Step 3: Implement `src/app/api/jobs/upload/route.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/app/api/jobs/upload/route.test.ts`
Expected: PASS, 4/4 tests green, against the live Neon database.

- [ ] **Step 5: Confirm no test rows were left behind**

```bash
node --env-file=.env.local -e "const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); Promise.all([prisma.user.count({ where: { email: { contains: '@agentjob-test.local' } } }), prisma.savedJob.count({ where: { link: { contains: 'x.com' } } })]).then(([users, jobs]) => { console.log('users:', users, 'jobs:', jobs); process.exit(0); });"
```

Expected: `users: 0 jobs: 0`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/jobs/upload/route.ts src/app/api/jobs/upload/route.test.ts
git commit -m "$(cat <<'EOF'
feat: add POST /api/jobs/upload endpoint

Accepts multipart form data (file + userId), parses the .xlsx with
parseExcelRows, bulk-creates valid rows as SavedJob, and reports a
summary. Trusts the client-supplied userId directly, matching the
MVP security model established by the auth feature. Integration-
tested against the live Neon database.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `/upload` page

**Files:**
- Create: `src/app/upload/page.tsx`

**Interfaces:**
- Consumes: `getStoredUser` from `@/lib/auth-storage` (already exists), calls `POST /api/jobs/upload` (Task 2).

No automated test for this task (React component with file input and `fetch`) — verified via `npm run build` and a manual/browser end-to-end check.

- [ ] **Step 1: Create `src/app/upload/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { getStoredUser } from "@/lib/auth-storage";

interface UploadResult {
  imported: number;
  errors: { row: number; reason: string }[];
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);

    const user = getStoredUser();
    if (!file || !user) {
      setError("Selecciona un archivo .xlsx");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.set("userId", user.id);
    formData.set("file", file);

    try {
      const response = await fetch("/api/jobs/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        setError("No se pudo subir el archivo. Intenta de nuevo.");
        setLoading(false);
        return;
      }

      const json = (await response.json()) as UploadResult;
      setResult(json);
      setLoading(false);
    } catch {
      setError("No se pudo subir el archivo. Intenta de nuevo.");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-dark-950 px-4 py-16 text-white">
      <h1 className="text-3xl font-bold">Subir postulaciones</h1>
      <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-4">
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-dark-200"
        />
        {error && <p className="text-sm text-magenta-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-cyan-400 py-2 font-semibold text-dark-950 transition-colors hover:bg-cyan-300 disabled:opacity-50"
        >
          {loading ? "Subiendo..." : "Subir"}
        </button>
      </form>

      {result && (
        <div className="w-full max-w-md text-dark-200">
          <p className="mb-2">
            {result.imported} filas importadas, {result.errors.length} con errores.
          </p>
          {result.errors.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-magenta-400">
              {result.errors.map((err) => (
                <li key={err.row}>
                  Fila {err.row}: {err.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: exit 0, and the route list now includes `/upload`.

- [ ] **Step 3: Manual end-to-end verification**

Run `npm run dev`, and with a browser (or, if browser automation is unavailable in this environment, via `curl -F` against the running dev server, being explicit in your report about what could and could not be verified without a real browser — same caveat as the auth feature's Task 5):

1. Log in via the email gate (or confirm an existing localStorage session), navigate to `/upload`.
2. Build a small real `.xlsx` test file with a few valid rows and one row missing `Titulo` (you can generate one with a short throwaway Node script using `exceljs`, the same way the tests do, then delete the script afterward — don't hand-craft a binary file).
3. Upload it. Confirm the summary shows the correct imported count and the correct per-row error.
4. Confirm (via a one-off Prisma query, not the UI) that the imported rows exist in `SavedJob` scoped to your test user, then delete them.

- [ ] **Step 4: Commit**

```bash
git add src/app/upload/page.tsx
git commit -m "$(cat <<'EOF'
feat: add /upload page

File input + submit, calls POST /api/jobs/upload with the current
user's id, renders the imported/errors summary.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: exit 0. Test count should be 12 (from the auth feature) + 7 (`excel-parser.test.ts`) + 4 (`route.test.ts`) = 23.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Confirm no leftover test data**

```bash
node --env-file=.env.local -e "const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); Promise.all([prisma.user.count({ where: { email: { contains: '@agentjob-test.local' } } }), prisma.savedJob.count({ where: { link: { contains: 'x.com' } } })]).then(([users, jobs]) => { console.log('users:', users, 'jobs:', jobs); process.exit(0); });"
```

Expected: `users: 0 jobs: 0`.

- [ ] **Step 5: Confirm git history**

Run: `git log --oneline`
Expected: the 3 feature commits from Tasks 1-3 are present.

---

## Spec coverage check

- Library choice (`exceljs`) → Task 1.
- Exact header names, optional Salario/Estado, default status `"saved"` → Task 1 (`excel-parser.ts`), tested.
- Column-order independence, blank-row skipping, hyperlink cells → Task 1, tested.
- Per-row errors don't fail the whole request; unparseable file does → Task 2.
- Client-trusted `userId`, no re-verification → Task 2.
- Upload-only scope (no listing/dashboard) → Task 3 (page only renders the summary, nothing else).
- No deduplication, `.xlsx` only → not present anywhere in the diff, confirmed absent by design.
- Acceptance criteria (lint/test/build pass, N-row import, partial-error import, 400s before DB work, no leftover test data) → Tasks 1-4.
