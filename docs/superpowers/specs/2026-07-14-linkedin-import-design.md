# LinkedIn Import (HTML Paste) — Design Spec

## Purpose

Let an authenticated user import job postings from a LinkedIn search-results page without typing/copying data into an Excel file by hand. The user pastes the rendered HTML of the results container (copied from the browser's DevTools) into a new page; the server parses it into structured job listings and creates `SavedJob` rows, deduplicated against what the user already has saved. This is the first step toward automating job discovery — today the user manually finds jobs on LinkedIn/Bumeran and either types them into Excel or applies by hand; this feature removes the "type them into Excel" step for LinkedIn specifically.

## Context

- Excel upload (`docs/superpowers/specs/2026-07-09-excel-upload-design.md`) is the only existing way to create `SavedJob` rows; it has no deduplication and only accepts `.xlsx`.
- `SavedJob` (`prisma/schema.prisma`) has `title`, `company`, `portal`, `salary?`, `link`, `status` (default `"saved"`) — no `location` field yet.
- LinkedIn has no public third-party job-search API, and its job search results are rendered client-side (React), so a plain HTTP fetch or "View Source" only returns an empty shell — the only reliable way to get the rendered markup without live scraping (and its account-ban / ToS risk) is to have the user copy it directly from their own already-loaded, already-authenticated browser session via DevTools ("Copy → Copy outerHTML" on the results container). No network requests to LinkedIn are made by the server at any point.
- `getStoredUser()` (`src/lib/auth-storage.ts`) supplies `{id, email}` client-side; the established MVP security model (client-trusted `userId`, no server-side re-verification) applies here exactly as it does to Excel upload and the profile optimizer.
- No HTML-parsing library is in `package.json` yet.

## Decisions (from brainstorming)

1. **Portal: LinkedIn only**, for this feature. Bumeran/other portals are out of scope — LinkedIn was chosen first despite being the harder target, because it's where the most relevant listings are.
2. **Capture mechanism: manual HTML paste**, not live scraping. The user searches LinkedIn logged in as themselves, opens DevTools, copies the `outerHTML` of the results container, and pastes it into the app. The server only ever parses a string the client sent — it never requests anything from linkedin.com. This avoids both the account-ban risk of automated/cookie-based scraping and the incompleteness of unauthenticated scraping.
3. **New nav destination**, not a mode inside `/upload`: a new page at `/import/linkedin` with its own nav link ("Importar LinkedIn"), kept separate from the Excel flow since the input and mechanism are unrelated.
4. **Deduplication by `link`**: before creating a row, the endpoint checks whether a `SavedJob` with the same `userId` + `link` already exists; if so, it's skipped (not duplicated, not overwritten). The import summary reports both counts.
5. **New field: `location` on `SavedJob`** (optional string). LinkedIn always shows a location/remote label on every job card, and Excel-imported rows simply have `location: null`.
6. **Parsing approach: deterministic, no AI.** A new `src/lib/linkedin-parser.ts` uses `cheerio` (new dependency) with CSS selectors for LinkedIn's known job-card structure, falling back to a heuristic that locates anchors matching `/jobs/view/\d+` and walks up the DOM to find the nearest title/company/location text when the primary selectors find nothing. This mirrors the Excel parser's shape (`{ valid, errors }` → here `{ jobs, unrecognized }`) and keeps cost at zero (no LLM calls). If LinkedIn's markup drifts enough to break this regularly, an AI-based fallback (reusing `executeStructuredAgent`) is a natural future iteration — not built now.
7. **Paste size cap: 2MB** of text, enforced before parsing (comparable in spirit to the Excel upload's 5MB file cap; a single results-page paste should be well under this).

## Components

### `src/lib/linkedin-parser.ts` (new, pure function — no DB, no network)

```ts
import * as cheerio from "cheerio";

export interface ParsedLinkedInJob {
  title: string;
  company: string;
  location: string | null;
  salary: string | null;
  link: string;
}

export interface LinkedInParseResult {
  jobs: ParsedLinkedInJob[];
  unrecognizedCount: number;
}

export function parseLinkedInHtml(html: string): LinkedInParseResult;
```

Behavior:
- Loads `html` into `cheerio`.
- Primary pass: selects known LinkedIn job-card containers and reads title/company/location/salary/link from their expected child elements.
- Fallback pass (only for cards the primary pass didn't recognize, or if the primary selector matches nothing at all): finds `<a>` elements whose `href` matches `/\/jobs\/view\/\d+/`, normalizes the href (strips tracking query params, ensures an absolute `https://www.linkedin.com/...` URL), and walks up to the nearest ancestor card-like element to pull title/company/location text heuristically.
- A "card" that yields a link but no usable `title` or `company` is not added to `jobs`; it increments `unrecognizedCount` instead (not a per-item error list, since there's no meaningful "row number" for pasted HTML).
- `salary` is `null` in the large majority of cases (LinkedIn rarely shows it in search-result cards) — populated only when present.
- Every returned job has `portal` implied as `"LinkedIn"` by the caller (the parser itself doesn't set it, since this module only ever handles LinkedIn markup).
- Pure and independently unit-testable against saved HTML fixtures — no DB, no network, no browser.

### `src/app/api/jobs/import-linkedin/route.ts` (new)

`POST` handler, JSON body `{ userId: string, html: string }`:
- 400 if `userId` or `html` is missing, or `html` exceeds the 2MB cap.
- Calls `parseLinkedInHtml(html)`.
- If `jobs.length === 0`: returns `200 { imported: 0, duplicates: 0, unrecognizedCount, jobs: [] }` — the empty-result case is reported the same way as a partial one; the client decides how to phrase "found nothing recognizable."
- For each parsed job, checks for an existing `SavedJob` with the same `userId` + `link` (a single `findMany({ where: { userId, link: { in: [...] } } })` batched lookup, not one query per job).
- Creates the non-duplicate jobs via `createMany`, each with `portal: "LinkedIn"`, `status: "saved"`.
- Returns `200 { imported: number, duplicates: number, unrecognizedCount: number }`.
- Returns `500 { error: "Error interno" }` on unexpected DB error (same pattern as `GET /api/jobs`).

### `src/app/import/linkedin/page.tsx` (new)

Client component:
- Short instructions (search on LinkedIn → DevTools → select the results container → Copy → Copy outerHTML → paste below).
- A `<textarea>` for the pasted HTML and a submit button.
- On submit: `POST /api/jobs/import-linkedin` with `{ userId, html }`; renders the returned summary, e.g. `"${imported} vacantes nuevas, ${duplicates} ya existían"`, plus `"${unrecognizedCount} tarjetas no se pudieron reconocer"` when that count is nonzero.
- Loading state while in flight; generic error message on request failure, same pattern as `/upload`.

### Schema migration

- Add `location String?` to `SavedJob` in `prisma/schema.prisma`, applied via `prisma db push` (the sync method this project uses — no formal migration files yet).

### Dashboard (`/dashboard`, `GET /api/jobs`)

- `GET /api/jobs` already returns full `SavedJob` rows via `findMany`, so `location` is included automatically — no server change needed there.
- `src/app/dashboard/page.tsx`: add a `Ubicación` column to the table, rendering `job.location ?? "—"`.

### Nav

- `AuthGate`'s nav bar gets a fourth link: "Importar LinkedIn" → `/import/linkedin`, alongside Dashboard/Upload/Perfil.

## Data flow

1. User searches LinkedIn in their own browser tab, copies the results container's `outerHTML` via DevTools.
2. User pastes it into `/import/linkedin` and submits.
3. Client sends `{ userId, html }` to `POST /api/jobs/import-linkedin`.
4. Server parses the HTML with `parseLinkedInHtml`, looks up existing links for that user, creates the non-duplicate rows as `SavedJob`s with `portal: "LinkedIn"`, `status: "saved"`.
5. Client renders the import summary.
6. User visits `/dashboard` and sees the newly imported jobs alongside anything from Excel, now tracking status the same way regardless of source.

## Error handling

- Missing `userId`/`html`, or `html` over the 2MB cap: `400` before any parsing.
- Zero recognizable jobs in otherwise-valid HTML: not an error — `200` with `imported: 0` and a clear `unrecognizedCount`, since a legitimate paste of the wrong DOM node (or an empty results page) is a normal user mistake, not a system failure.
- Malformed/unparseable HTML (cheerio is lenient and rarely throws, but a defensive catch exists): `500 { error: "No se pudo leer el HTML pegado" }`.
- Foreign-key violation on `userId` (stale/tampered client value): `500`, consistent with the Excel upload endpoint's handling of the same MVP-security-model edge case.

## Testing approach

- `src/lib/linkedin-parser.test.ts`: pure unit tests against small hand-built HTML fixtures (not full real LinkedIn pages) covering: a well-formed card via the primary selector path, a card only recognizable via the `/jobs/view/` fallback heuristic, a card with no usable title/company (counted as unrecognized), an empty/irrelevant HTML string, and href normalization (tracking params stripped).
- `src/app/api/jobs/import-linkedin/route.test.ts`: live-DB integration test (same pattern as `upload/route.test.ts`) — creates a throwaway `User`, seeds one existing `SavedJob` to prove dedup skips it, submits HTML containing that same link plus a new one, asserts `{ imported: 1, duplicates: 1 }` and that exactly one new row exists; cleans up all created rows in `afterEach`/`afterAll`.

## Out of scope

- Bumeran or any portal other than LinkedIn.
- Any form of automated/live scraping (cookie-based or unauthenticated) — this is a hard constraint from the brainstorming decision, not just a v1 simplification.
- AI-based extraction fallback — noted as a future iteration if the deterministic parser proves too fragile against LinkedIn markup changes.
- Pagination handling across multiple pastes — each paste is one independent import; a user wanting more results pastes additional pages separately.
- Editing/removing a `SavedJob` after import beyond what the dashboard's existing status dropdown already allows.
- Retroactively backfilling `location` for existing Excel-imported rows.

## Acceptance criteria

- `npm run lint`, `npm run test`, and `npm run build` pass.
- Pasting HTML containing recognizable LinkedIn job cards creates one `SavedJob` per new `link` (scoped to the authenticated user), each with `portal: "LinkedIn"`, `status: "saved"`, and `location` populated when present in the source card.
- Re-pasting HTML containing a `link` already saved for that user does not create a duplicate row; the summary's `duplicates` count reflects it.
- Pasting HTML with no recognizable job cards returns `imported: 0` with a nonzero `unrecognizedCount`, not an error.
- A request missing `userId`/`html`, or exceeding the 2MB cap, is rejected with `400` before any parsing/DB work.
- The dashboard shows a location column, falling back to `—` for rows without one (e.g., Excel-imported).
- No test-created rows (`User` or `SavedJob`) are left behind in the live database after the test suite runs.
