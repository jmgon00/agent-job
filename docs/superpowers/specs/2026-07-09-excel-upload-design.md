# Excel Upload — Design Spec

## Purpose

Let an authenticated user upload an `.xlsx` file listing job postings/applications and have each valid row become a `SavedJob` row in the database, scoped to that user. This is the first feature to write real business data (beyond the `User` row created by auth) into the schema built during the Day 1 scaffold.

## Context

- Auth (email + localStorage) is done: `getStoredUser()` from `src/lib/auth-storage.ts` gives `{id, email}` client-side; the established MVP security model is that the client sends `userId` directly and the server trusts it without re-verification (documented in `docs/superpowers/specs/2026-07-08-auth-design.md`).
- `prisma/schema.prisma`'s `SavedJob` model already has the fields this feature needs: `title`, `company`, `portal`, `salary?`, `link`, `status` (default `"saved"`), plus `userId`.
- `src/app/api/jobs/` currently contains only a `.gitkeep` placeholder from the Day 1 scaffold.
- Vitest is set up (from the auth feature) with a jsdom environment and a `@` path alias; the live Neon database is reachable via `.env.local`'s `DATABASE_URL`.

## Decisions (from brainstorming)

1. **Library: `exceljs`**, not `xlsx` (SheetJS) — the npm-published `xlsx` package has lagged behind SheetJS's own security patches (known prototype-pollution/ReDoS advisories in older versions); `exceljs` is actively maintained on npm.
2. **Expected columns (Spanish headers, first row):** `Titulo`, `Empresa`, `Portal`, `Salario` (optional), `Link`, `Estado` (optional, defaults to `"saved"` if blank).
3. **Scope: upload only.** A simple page with a file input, a submit button, and a result summary (`X filas importadas, Y con errores`) with per-row error detail. No listing/dashboard of previously saved jobs — that's a separate future "Dashboard" feature.
4. **No deduplication.** Every upload inserts new rows; no check against existing `link`/`title` values. Out of scope for this MVP pass.
5. **Only `.xlsx`** — no `.xls` or `.csv` support in this feature.

## Components

### `src/lib/excel-parser.ts` (new, pure function — no DB, no network)

```ts
import ExcelJS from "exceljs";

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

export async function parseExcelRows(buffer: Buffer): Promise<ParseResult>;
```

Behavior:
- Loads the workbook from the buffer, reads the first worksheet.
- Row 1 is the header row (`Titulo`, `Empresa`, `Portal`, `Salario`, `Link`, `Estado` — case-sensitive match to these exact Spanish headers, in any column order).
- For each subsequent row: validates `Titulo`, `Empresa`, `Portal`, `Link` are non-empty strings (via a Zod schema); `Salario` and `Estado` are optional, `Estado` defaults to `"saved"` when blank.
- A row that fails validation is NOT added to `valid` — it's recorded in `errors` with its 1-based spreadsheet row number and a human-readable reason (e.g., `"Falta Titulo"`, `"Falta Link"`).
- An empty worksheet (only a header row, or no rows at all) returns `{ valid: [], errors: [] }`, not an error — the API layer decides how to report "nothing to import."
- This function is independently unit-testable: tests build an in-memory workbook with `exceljs` itself (no fixture files, no DB).

### `src/app/api/jobs/upload/route.ts` (new)

`POST` handler:
- Parses the incoming `multipart/form-data`: expects a `file` field (the `.xlsx`) and a `userId` field (string, from the client's cached auth state).
- Validates `userId` is present (400 if missing — this endpoint does NOT create or look up users; it trusts an already-resolved id, consistent with the auth feature's established model).
- Validates the file's presence and that its name ends in `.xlsx` (400 otherwise, e.g. `"Solo se aceptan archivos .xlsx"`).
- Calls `parseExcelRows` on the file's buffer.
- Bulk-creates the `valid` rows via `prisma.savedJob.createMany({ data: valid.map((row) => ({ ...row, userId })) })`.
- Returns `200 { imported: number, errors: ParseError[] }` (imported = count actually created; errors = the parser's row-level errors, unchanged).
- Returns `500 { error: string }` on unexpected DB error (e.g., `userId` referencing a non-existent `User` row — Prisma's foreign key constraint will reject this, which is treated as a 500 here since it's an unexpected/tampered-client scenario, not a normal validation failure).

### `src/app/upload/page.tsx` (new)

A client component page:
- A `<form>` with a file `<input type="file" accept=".xlsx">` and a submit button.
- On submit: builds a `FormData` with the file and the `userId` from `getStoredUser()` (redirect-equivalent guard: if no stored user, this page shouldn't be reachable anyway since the whole app is behind `AuthGate` — no separate check needed here).
- Calls `POST /api/jobs/upload`, then renders the returned summary: `"${imported} filas importadas, ${errors.length} con errores"`, followed by a list of `Fila ${row}: ${reason}` for each error.
- Shows a loading state while the request is in flight and a generic error message if the request itself fails (network/500), reusing the same UX pattern as `EmailGateModal`.

## Data flow

1. Authenticated user visits `/upload`, selects a `.xlsx` file, submits.
2. Client sends `FormData` (`file`, `userId`) to `POST /api/jobs/upload`.
3. Server validates the request shape, parses rows with `parseExcelRows`, bulk-creates valid rows scoped to `userId`, returns the summary.
4. Client renders the summary and per-row errors.

## Error handling

- Missing/invalid `userId` or missing/wrong-extension file: `400` with a specific message, shown to the user before any parsing happens.
- Per-row validation errors (missing required column value): collected and returned, not thrown — the request still succeeds (`200`) as long as the file itself was parseable, since partial success (some rows imported, some not) is the expected common case for real-world spreadsheets.
- A completely unparseable file (e.g., corrupted `.xlsx`, not actually an Excel file despite the extension): `parseExcelRows` will throw; the route catches this and returns `500 { error: "No se pudo leer el archivo" }` (distinct from per-row errors, since the whole file failed, not individual rows).
- Foreign-key violation (a `userId` that doesn't exist in `User`) is treated as a `500`, not a `400` — this is an MVP-security-model edge case (a tampered/stale client value), not a normal user-facing validation error.

## Testing approach

- `src/lib/excel-parser.test.ts`: pure unit tests, no DB. Build small in-memory workbooks with `exceljs` (valid rows, rows missing required fields, extra/blank rows, columns in a different order, an empty sheet) and assert `parseExcelRows`'s `valid`/`errors` output.
- `src/app/api/jobs/upload/route.test.ts`: live-DB integration test (same pattern as the auth feature's `route.test.ts`) — needs a real `User` row to satisfy the foreign key, so the test creates one (unique `@agentjob-test.local` email) in a `beforeEach`/`beforeAll`, uploads a small in-memory `.xlsx` buffer built with `exceljs` directly in the test, asserts the returned `SavedJob` rows exist and match, and cleans up both the `SavedJob` rows and the `User` row it created in `afterEach`/`afterAll`.

## Out of scope

- Deduplication against existing `SavedJob` rows.
- Listing/viewing previously uploaded jobs (Dashboard feature).
- `.xls` or `.csv` formats.
- Editing or deleting individual rows after upload.
- Any AI-assisted column-mapping or fuzzy header matching (headers must match the exact expected Spanish names).

## Acceptance criteria

- `npm run lint`, `npm run test`, and `npm run build` pass.
- Uploading a valid `.xlsx` with N well-formed rows creates N `SavedJob` rows for the authenticated user and reports `{ imported: N, errors: [] }`.
- A file with some malformed rows (e.g., missing `Titulo`) imports the valid rows and reports the malformed ones with their row numbers and reasons, without failing the whole request.
- A non-`.xlsx` file, or a request missing `userId`, is rejected with `400` before any parsing/DB work happens.
- No test-created rows (`User` or `SavedJob`) are left behind in the live database after the test suite runs.
