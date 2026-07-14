# LinkedIn Import (HTML Paste) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authenticated user paste the rendered HTML of a LinkedIn job-search results page and have each recognizable job become a `SavedJob` row (deduplicated by link), per the approved design spec (`docs/superpowers/specs/2026-07-14-linkedin-import-design.md`).

**Architecture:** A pure parsing function (`parseLinkedInHtml`) turns a pasted HTML string into `{jobs, unrecognizedCount}` with no DB/network involved, independently unit-tested against small hand-built fixtures. A `POST /api/jobs/import-linkedin` route accepts JSON (`userId` + `html`), calls the parser, looks up which of the parsed links already exist for that user, bulk-creates only the new ones with `portal: "LinkedIn"`, and returns a summary. A client page (`/import/linkedin`) provides the textarea, submit button, and instructions, reachable from a new nav link. The dashboard gains a location column to surface the one new field this feature introduces.

**Tech Stack:** `cheerio` (new dependency) for HTML parsing, Prisma for the schema change + dedup lookup + bulk create, Vitest (already set up) for both a pure unit-test suite and a live-DB integration test.

## Global Constraints

- No live scraping of any kind — the server never makes a network request to linkedin.com. It only ever parses an HTML string the client already sent it.
- Parsing is deterministic (`cheerio` + selectors + href-based fallback heuristic) — no AI/LLM call in this feature.
- Every created `SavedJob` from this feature has `portal: "LinkedIn"` (hardcoded, not parsed) and `status: "saved"` (matching the existing default).
- Deduplication is by `link`, scoped per `userId` — a job whose link already exists for that user is skipped, not duplicated or overwritten.
- The pasted `html` is capped at 2MB; requests over that are rejected with `400` before parsing.
- The endpoint trusts a client-supplied `userId` directly (no re-verification) — same MVP security model as every other endpoint in this project.
- A card that can't be resolved to a `title`+`company` counts toward `unrecognizedCount`, not toward an error list — there's no "row number" for pasted HTML.
- Any test that writes to the live database MUST clean up the rows it created (scoped deletes only — this is a shared real database, not a disposable test instance).
- Commit messages must end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Schema — `SavedJob.location`

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `SavedJob.location: string | null` (Prisma field), consumed by Task 2's route (sets it on create) and Task 5 (dashboard renders it). `GET /api/jobs` (`src/app/api/jobs/route.ts`) needs no code change — it already does `findMany` with no field selection, so the new column is included automatically once the client is regenerated.

- [ ] **Step 1: Add `location` to the `SavedJob` model**

In `prisma/schema.prisma`, add `location` right after `company` (keep every other field and index as-is):

```prisma
model SavedJob {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  title     String
  company   String
  location  String?
  portal    String
  salary    String?
  link      String
  status    String   @default("saved")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  applications Application[]

  @@index([userId])
  @@index([portal])
  @@index([status])
}
```

- [ ] **Step 2: Push the schema to Neon and regenerate the client**

Run:
```bash
npx prisma db push
npx prisma generate
```
Expected: `npx prisma db push` prints `Your database is now in sync with your Prisma schema.` with no errors; `npx prisma generate` regenerates `@prisma/client` with the new `location` field on `SavedJob`.

- [ ] **Step 3: Run the existing test suite to confirm nothing broke**

Run: `npm run test`
Expected: all 47 existing tests still PASS (this step only touches schema; no existing code references the new field yet).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "$(cat <<'EOF'
feat: add SavedJob.location

Optional field for the location/remote label LinkedIn always shows
on job cards. Excel-imported rows keep it null.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `parseLinkedInHtml` (pure function, unit-tested)

**Files:**
- Modify: `package.json` (add `cheerio` dependency)
- Create: `src/lib/linkedin-parser.ts`
- Create: `src/lib/linkedin-parser.test.ts`

**Interfaces:**
- Produces: `ParsedLinkedInJob` (`{title, company, location: string | null, salary: string | null, link}`), `LinkedInParseResult` (`{jobs: ParsedLinkedInJob[], unrecognizedCount: number}`), and `parseLinkedInHtml(html: string): LinkedInParseResult` — exported from `@/lib/linkedin-parser`, consumed by Task 3's route.

- [ ] **Step 1: Add `cheerio` to `package.json` dependencies**

Add to `dependencies` (alongside the existing entries — do not remove or reorder others):

```json
"cheerio": "^1.2.0"
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: exit 0, `cheerio` appears under `node_modules`.

- [ ] **Step 3: Write the failing tests — `src/lib/linkedin-parser.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { parseLinkedInHtml } from "./linkedin-parser";

describe("parseLinkedInHtml", () => {
  it("extracts a job from the known public job-search-card structure, stripping tracking params from the link", () => {
    const html = `
      <ul>
        <li>
          <div class="base-card job-search-card">
            <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/111?refId=abc&trk=xyz">
              <h3 class="base-search-card__title">Frontend Developer</h3>
              <h4 class="base-search-card__subtitle">Mercado Libre</h4>
              <div class="base-search-card__metadata">
                <span class="job-search-card__location">Buenos Aires, Argentina</span>
              </div>
            </a>
          </div>
        </li>
      </ul>
    `;

    const result = parseLinkedInHtml(html);

    expect(result.unrecognizedCount).toBe(0);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toEqual({
      title: "Frontend Developer",
      company: "Mercado Libre",
      location: "Buenos Aires, Argentina",
      salary: null,
      link: "https://www.linkedin.com/jobs/view/111",
    });
  });

  it("falls back to the href-based heuristic when the card uses unrecognized (obfuscated) classes", () => {
    const html = `
      <li>
        <div class="abc123 def456">
          <a href="/jobs/view/222">
            <div class="xh12">
              <span>Backend Engineer (Node.js)</span>
              <span>Globant</span>
              <span>Ciudad Autonoma de Buenos Aires, Argentina</span>
            </div>
          </a>
        </div>
      </li>
    `;

    const result = parseLinkedInHtml(html);

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].title).toBe("Backend Engineer (Node.js)");
    expect(result.jobs[0].company).toBe("Globant");
    expect(result.jobs[0].location).toBe("Ciudad Autonoma de Buenos Aires, Argentina");
    expect(result.jobs[0].link).toBe("https://www.linkedin.com/jobs/view/222");
  });

  it("counts a card with fewer than two usable text values as unrecognized, not as a job", () => {
    const html = `
      <li>
        <a href="/jobs/view/333">
          <span>OnlyOneText</span>
        </a>
      </li>
    `;

    const result = parseLinkedInHtml(html);

    expect(result.jobs).toEqual([]);
    expect(result.unrecognizedCount).toBe(1);
  });

  it("returns no jobs and no unrecognized count for HTML with no job links at all", () => {
    const html = `<div><p>No hay vacantes aca.</p></div>`;

    const result = parseLinkedInHtml(html);

    expect(result.jobs).toEqual([]);
    expect(result.unrecognizedCount).toBe(0);
  });
});
```

- [ ] **Step 4: Run the tests and confirm they fail**

Run: `npx vitest run src/lib/linkedin-parser.test.ts`
Expected: FAIL — `src/lib/linkedin-parser.ts` does not exist yet.

- [ ] **Step 5: Implement `src/lib/linkedin-parser.ts`**

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

const JOB_VIEW_LINK_RE = /\/jobs\/view\/\d+/;
const SALARY_RE = /(\$\s?[\d.,]+(?:\s?-\s?\$?\s?[\d.,]+)?|\bUSD\b[^,\n]{0,20}|\bARS\b[^,\n]{0,20})/i;
const LOCATION_RE = /remoto|remote|h[ií]brido|hybrid|,\s*[A-ZÁÉÍÓÚÑ]/;

function normalizeJobUrl(href: string): string {
  const absolute = href.startsWith("http")
    ? href
    : `https://www.linkedin.com${href.startsWith("/") ? "" : "/"}${href}`;
  return absolute.split("?")[0];
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function parseLinkedInHtml(html: string): LinkedInParseResult {
  const $ = cheerio.load(html);
  const jobs: ParsedLinkedInJob[] = [];
  const seenLinks = new Set<string>();
  let unrecognizedCount = 0;

  $(".job-search-card, .base-search-card").each((_, el) => {
    const $card = $(el);
    const href = $card
      .find("a.base-card__full-link, a[href*='/jobs/view/']")
      .first()
      .attr("href");
    if (!href) return;

    const link = normalizeJobUrl(href);
    const title = collapseWhitespace($card.find(".base-search-card__title").first().text());
    const company = collapseWhitespace($card.find(".base-search-card__subtitle").first().text());
    const locationText = collapseWhitespace(
      $card.find(".job-search-card__location").first().text()
    );

    if (!title || !company) {
      unrecognizedCount++;
      return;
    }

    const salaryMatch = collapseWhitespace($card.text()).match(SALARY_RE);

    seenLinks.add(link);
    jobs.push({
      title,
      company,
      location: locationText || null,
      salary: salaryMatch ? salaryMatch[0].trim() : null,
      link,
    });
  });

  $("a[href*='/jobs/view/']").each((_, el) => {
    const $anchor = $(el);
    const href = $anchor.attr("href");
    if (!href || !JOB_VIEW_LINK_RE.test(href)) return;

    const link = normalizeJobUrl(href);
    if (seenLinks.has(link)) return;

    const $li = $anchor.closest("li");
    const $scope = $li.length ? $li : $anchor.parent().parent();

    const texts = Array.from(
      new Set(
        $scope
          .find("*")
          .addBack()
          .contents()
          .filter((_, node) => node.type === "text")
          .map((_, node) => collapseWhitespace($(node).text()))
          .get()
          .filter((text) => text.length > 1)
      )
    );

    if (texts.length < 2) {
      unrecognizedCount++;
      return;
    }

    const title = texts[0];
    const company = texts[1];
    const location = texts.find((text) => LOCATION_RE.test(text) && text !== title && text !== company) ?? null;
    const salaryMatch = collapseWhitespace($scope.text()).match(SALARY_RE);

    seenLinks.add(link);
    jobs.push({
      title,
      company,
      location,
      salary: salaryMatch ? salaryMatch[0].trim() : null,
      link,
    });
  });

  return { jobs, unrecognizedCount };
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/linkedin-parser.test.ts`
Expected: PASS, 4/4 tests green.

If a specific case doesn't pass on the first try (e.g. the fallback text-ordering or the location regex), adjust `linkedin-parser.ts` until it does — the tests above are the source of truth for behavior, not the draft implementation. Do not change the tests to match a wrong implementation.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/linkedin-parser.ts src/lib/linkedin-parser.test.ts
git commit -m "$(cat <<'EOF'
feat: add LinkedIn HTML parser

parseLinkedInHtml turns a pasted results-page HTML string into
{jobs, unrecognizedCount} with no DB or network involved. Tries known
job-search-card selectors first, falls back to a /jobs/view/ anchor
heuristic for obfuscated markup, and normalizes links by stripping
tracking query params.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `POST /api/jobs/import-linkedin` route (live-DB integration test)

**Files:**
- Create: `src/app/api/jobs/import-linkedin/route.ts`
- Create: `src/app/api/jobs/import-linkedin/route.test.ts`

**Interfaces:**
- Consumes: `parseLinkedInHtml` from `@/lib/linkedin-parser` (Task 2), `prisma` from `@/lib/db`.
- Produces: `POST` handler returning `200 {imported: number, duplicates: number, unrecognizedCount: number}` on success, `400 {error: string}` for a missing/oversized `userId`/`html`, `500 {error: string}` for a parse or DB error. Task 4's page calls this.

This test hits the live Neon database. It needs a real `User` row to satisfy `SavedJob`'s foreign key — create one in `beforeAll` (unique `@agentjob-test.local` email), delete it in `afterAll`, and delete any `SavedJob` rows created by each test in `afterEach`.

- [ ] **Step 1: Write the failing tests — `src/app/api/jobs/import-linkedin/route.test.ts`**

```ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { POST } from "./route";
import { prisma } from "@/lib/db";

let testUserId: string;
const testUserEmail = `test-import-linkedin-${Date.now()}@agentjob-test.local`;

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

function importRequest(body: unknown): Request {
  return new Request("http://localhost/api/jobs/import-linkedin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function cardHtml(id: string, title: string, company: string): string {
  return `
    <li>
      <div class="base-card job-search-card">
        <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/${id}?trk=xyz">
          <h3 class="base-search-card__title">${title}</h3>
          <h4 class="base-search-card__subtitle">${company}</h4>
          <div class="base-search-card__metadata">
            <span class="job-search-card__location">Buenos Aires, Argentina</span>
          </div>
        </a>
      </div>
    </li>
  `;
}

describe("POST /api/jobs/import-linkedin", () => {
  it("imports new jobs and skips ones already saved by link", async () => {
    await prisma.savedJob.create({
      data: {
        userId: testUserId,
        title: "Old",
        company: "Old Co",
        portal: "LinkedIn",
        link: "https://www.linkedin.com/jobs/view/999",
        status: "saved",
      },
    });

    const html = `<ul>${cardHtml("999", "Old", "Old Co")}${cardHtml("111", "Frontend Developer", "Mercado Libre")}</ul>`;

    const response = await POST(importRequest({ userId: testUserId, html }));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.imported).toBe(1);
    expect(json.duplicates).toBe(1);

    const saved = await prisma.savedJob.findMany({ where: { userId: testUserId } });
    expect(saved).toHaveLength(2);
    const newRow = saved.find((job) => job.link === "https://www.linkedin.com/jobs/view/111");
    expect(newRow?.title).toBe("Frontend Developer");
    expect(newRow?.location).toBe("Buenos Aires, Argentina");
    expect(newRow?.portal).toBe("LinkedIn");
    expect(newRow?.status).toBe("saved");
  });

  it("rejects a missing userId with 400", async () => {
    const response = await POST(importRequest({ html: "<div></div>" }));
    expect(response.status).toBe(400);
  });

  it("rejects a missing html with 400", async () => {
    const response = await POST(importRequest({ userId: testUserId }));
    expect(response.status).toBe(400);
  });

  it("returns imported: 0 without erroring for HTML with no jobs", async () => {
    const response = await POST(
      importRequest({ userId: testUserId, html: "<div>no jobs here</div>" })
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.imported).toBe(0);
    expect(json.duplicates).toBe(0);
    expect(json.unrecognizedCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/app/api/jobs/import-linkedin/route.test.ts`
Expected: FAIL — `src/app/api/jobs/import-linkedin/route.ts` does not exist yet.

- [ ] **Step 3: Implement `src/app/api/jobs/import-linkedin/route.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/app/api/jobs/import-linkedin/route.test.ts`
Expected: PASS, 4/4 tests green, against the live Neon database.

- [ ] **Step 5: Confirm no test rows were left behind**

```bash
node --env-file=.env.local -e "const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); Promise.all([prisma.user.count({ where: { email: { contains: '@agentjob-test.local' } } }), prisma.savedJob.count({ where: { link: { contains: 'linkedin.com/jobs/view' } } })]).then(([users, jobs]) => { console.log('users:', users, 'jobs:', jobs); process.exit(0); });"
```

Expected: `users: 0 jobs: 0`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/jobs/import-linkedin/route.ts src/app/api/jobs/import-linkedin/route.test.ts
git commit -m "$(cat <<'EOF'
feat: add POST /api/jobs/import-linkedin endpoint

Accepts {userId, html}, parses it with parseLinkedInHtml, dedupes
against existing SavedJob links for that user, and bulk-creates the
rest with portal "LinkedIn" and status "saved". Trusts the
client-supplied userId directly, matching the MVP security model
used everywhere else. Integration-tested against the live Neon
database.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `/import/linkedin` page and nav link

**Files:**
- Create: `src/app/import/linkedin/page.tsx`
- Modify: `src/components/sections/AuthGate.tsx:41-51`

**Interfaces:**
- Consumes: `getStoredUser` from `@/lib/auth-storage` (already exists), calls `POST /api/jobs/import-linkedin` (Task 3).

No automated test for this task (React component with a form and `fetch`) — verified via `npm run build` and a manual/browser end-to-end check.

- [ ] **Step 1: Create `src/app/import/linkedin/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { getStoredUser } from "@/lib/auth-storage";

interface ImportResult {
  imported: number;
  duplicates: number;
  unrecognizedCount: number;
}

export default function ImportLinkedInPage() {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);

    const user = getStoredUser();
    if (!html.trim() || !user) {
      setError("Pega el HTML de los resultados antes de importar.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/jobs/import-linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, html }),
      });

      if (!response.ok) {
        setError("No se pudo importar. Intenta de nuevo.");
        setLoading(false);
        return;
      }

      const json = (await response.json()) as ImportResult;
      setResult(json);
      setLoading(false);
    } catch {
      setError("No se pudo importar. Intenta de nuevo.");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-dark-950 px-4 py-16 text-white">
      <h1 className="text-3xl font-bold">Importar desde LinkedIn</h1>
      <ol className="w-full max-w-md list-decimal space-y-1 pl-5 text-sm text-dark-300">
        <li>Busca vacantes en LinkedIn logueado con tu cuenta.</li>
        <li>
          Abri las herramientas de desarrollador (F12) y ubica el contenedor
          de resultados en la pestana Elements.
        </li>
        <li>Click derecho sobre ese contenedor, Copy, Copy outerHTML.</li>
        <li>Pega el contenido abajo y presiona Importar.</li>
      </ol>
      <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-4">
        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          rows={10}
          placeholder="Pega aca el HTML copiado"
          className="rounded-lg bg-dark-800 p-3 font-mono text-xs text-white"
        />
        {error && <p className="text-sm text-magenta-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-cyan-400 py-2 font-semibold text-dark-950 transition-colors hover:bg-cyan-300 disabled:opacity-50"
        >
          {loading ? "Importando..." : "Importar"}
        </button>
      </form>

      {result && (
        <div className="w-full max-w-md text-dark-200">
          <p>
            {result.imported} vacantes nuevas, {result.duplicates} ya existian.
          </p>
          {result.unrecognizedCount > 0 && (
            <p className="text-sm text-dark-400">
              {result.unrecognizedCount} tarjetas no se pudieron reconocer.
            </p>
          )}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Add the nav link in `AuthGate`**

In `src/components/sections/AuthGate.tsx`, add a fourth link inside the `<nav>` (after "Perfil", lines 41-51):

```tsx
        <nav className="flex items-center gap-4">
          <a href="/dashboard" className="hover:text-cyan-400">
            Dashboard
          </a>
          <a href="/upload" className="hover:text-cyan-400">
            Subir Excel
          </a>
          <a href="/profile" className="hover:text-cyan-400">
            Perfil
          </a>
          <a href="/import/linkedin" className="hover:text-cyan-400">
            Importar LinkedIn
          </a>
        </nav>
```

- [ ] **Step 3: Verify the project builds**

Run: `npm run build`
Expected: exit 0, and the route list now includes `/import/linkedin`.

- [ ] **Step 4: Manual end-to-end verification**

Run `npm run dev`, and with a browser (or, if browser automation is unavailable in this environment, via `curl` against the running dev server, being explicit in your report about what could and could not be verified without a real browser):

1. Log in via the email gate (or confirm an existing localStorage session), navigate to `/import/linkedin`.
2. Paste a small hand-built HTML snippet using the `base-search-card`/`job-search-card` structure from Task 2/3's tests (a couple of `<li>` cards with different `/jobs/view/<id>` links).
3. Submit. Confirm the summary shows the correct imported/duplicates counts.
4. Submit the exact same HTML again. Confirm `imported: 0` and `duplicates` equal to the number of cards.
5. Confirm (via a one-off Prisma query, not the UI) that the imported rows exist in `SavedJob` scoped to your test user with `portal: "LinkedIn"` and the expected `location`, then delete them.

- [ ] **Step 5: Commit**

```bash
git add src/app/import/linkedin/page.tsx src/components/sections/AuthGate.tsx
git commit -m "$(cat <<'EOF'
feat: add /import/linkedin page and nav link

Textarea for pasted HTML, calls POST /api/jobs/import-linkedin with
the current user's id, renders the imported/duplicates/unrecognized
summary. Adds "Importar LinkedIn" to the AuthGate nav.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Dashboard location column

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `location: string | null` on the rows returned by `GET /api/jobs` (available automatically after Task 1's schema change — no API route change needed).

No automated test for this task (presentational change to an existing page) — verified via `npm run build` and the manual check in Step 3.

- [ ] **Step 1: Add `location` to the `SavedJobRow` interface**

In `src/app/dashboard/page.tsx`, update the interface (currently at lines 7-14):

```tsx
interface SavedJobRow {
  id: string;
  title: string;
  company: string;
  location: string | null;
  portal: string;
  link: string;
  status: JobStatus;
}
```

- [ ] **Step 2: Add a "Ubicacion" column to the table**

In the same file, add a header cell after "Empresa" (in the `<thead>` around line 113-119):

```tsx
          <tr className="border-b border-dark-700 text-sm text-dark-400">
            <th className="py-2 pr-4">Titulo</th>
            <th className="py-2 pr-4">Empresa</th>
            <th className="py-2 pr-4">Ubicacion</th>
            <th className="py-2 pr-4">Portal</th>
            <th className="py-2 pr-4">Estado</th>
            <th className="py-2 pr-4">Link</th>
          </tr>
```

And a matching data cell in the row map (after the "Empresa" `<td>`, around line 124-126):

```tsx
              <td className="py-2 pr-4">{job.title}</td>
              <td className="py-2 pr-4">{job.company}</td>
              <td className="py-2 pr-4">{job.location ?? "—"}</td>
              <td className="py-2 pr-4">{job.portal}</td>
```

- [ ] **Step 3: Verify the project builds and check the page manually**

Run: `npm run build`
Expected: exit 0.

Run `npm run dev`, navigate to `/dashboard` with a user that has at least one Excel-imported job (no `location`) and, after Task 4's manual check, at least one LinkedIn-imported job (has `location`). Confirm the new column shows the location for the LinkedIn row and `—` for the Excel row.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "$(cat <<'EOF'
feat: show location column on dashboard

Surfaces SavedJob.location (populated by the LinkedIn import feature,
null for Excel-imported rows) in the postulaciones table.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: exit 0. Test count should be 47 (baseline) + 4 (`linkedin-parser.test.ts`) + 4 (`route.test.ts`) = 55.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Confirm no leftover test data**

```bash
node --env-file=.env.local -e "const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); Promise.all([prisma.user.count({ where: { email: { contains: '@agentjob-test.local' } } }), prisma.savedJob.count({ where: { link: { contains: 'linkedin.com/jobs/view' } } })]).then(([users, jobs]) => { console.log('users:', users, 'jobs:', jobs); process.exit(0); });"
```

Expected: `users: 0 jobs: 0`.

- [ ] **Step 5: Confirm git history**

Run: `git log --oneline`
Expected: the 5 feature commits from Tasks 1-5 are present.

---

## Spec coverage check

- LinkedIn only, no live scraping, manual HTML paste mechanism → Global Constraints + Task 3 (no network calls) + Task 4's user instructions.
- New nav destination `/import/linkedin` (not a mode inside `/upload`) → Task 4.
- Deduplication by `link`, scoped per user → Task 3, tested.
- New `location` field on `SavedJob` → Task 1; surfaced in the dashboard → Task 5.
- Deterministic parser (`cheerio`, no AI), primary selectors + href-based fallback heuristic → Task 2, tested.
- 2MB paste size cap → Task 3.
- Client-trusted `userId`, no re-verification → Task 3.
- Zero-recognizable-jobs is not an error (`200` with `imported: 0`) → Task 3, tested.
- Unrecognized cards counted separately from errors (no per-item error list) → Task 2 (`unrecognizedCount`) and Task 3's response shape.
- Acceptance criteria (lint/test/build pass, per-link dedup, 400s before DB work, dashboard fallback to `—`, no leftover test data) → Tasks 1-6.
