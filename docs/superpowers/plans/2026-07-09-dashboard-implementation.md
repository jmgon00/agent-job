# Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authenticated user see their `SavedJob` rows and change each one's status, per the approved design spec.

**Architecture:** `GET /api/jobs` lists a user's `SavedJob` rows; `PATCH /api/jobs/[id]` updates one row's status after confirming it belongs to the requesting user. A shared `job-status.ts` module is the single source of truth for the three allowed status values. `/dashboard` is a client page that fetches the list and renders a table with an inline status `<select>` per row.

**Tech Stack:** Next.js 16 App Router route handlers (including a dynamic `[id]` route, whose `params` is a `Promise` per Next 16's breaking change), Prisma, Vitest (live-DB integration tests, same pattern as the auth and Excel-upload features).

## Global Constraints

- Status values are exactly `saved`, `applied`, `discarded` — defined once in `src/lib/job-status.ts` and imported everywhere else that needs them.
- `GET /api/jobs` and `PATCH /api/jobs/[id]` both scope to a client-supplied `userId` (no re-verification, matching the established MVP security model), but must never return or modify another user's rows.
- `PATCH` on a job that doesn't exist, or exists but belongs to a different user, returns `404` (not `403`) and makes no database change.
- No filtering, sorting, pagination, field editing besides `status`, or row deletion in this feature.
- Any test that writes to the live database MUST clean up everything it creates, scoped to that test run only.
- Commit messages must end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: `job-status.ts` + `GET /api/jobs` (live-DB integration test)

**Files:**
- Create: `src/lib/job-status.ts`
- Create: `src/app/api/jobs/route.ts`
- Create: `src/app/api/jobs/route.test.ts`

**Interfaces:**
- Produces: `JOB_STATUSES` (readonly tuple `["saved", "applied", "discarded"]`) and `JobStatus` type from `@/lib/job-status`, consumed by Task 2's `PATCH` route and Task 3's dashboard page.
- Produces: `GET` handler returning `200 {jobs: SavedJob[]}` (scoped to `?userId=`, newest first) or `400 {error}` when `userId` is missing.

- [ ] **Step 1: Create `src/lib/job-status.ts`**

```ts
export const JOB_STATUSES = ["saved", "applied", "discarded"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
```

- [ ] **Step 2: Write the failing tests — `src/app/api/jobs/route.test.ts`**

```ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { GET } from "./route";
import { prisma } from "@/lib/db";

let testUserId: string;
let otherUserId: string;
const testUserEmail = `test-jobs-${Date.now()}@agentjob-test.local`;
const otherUserEmail = `test-jobs-other-${Date.now()}@agentjob-test.local`;

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: testUserEmail } });
  testUserId = user.id;
  const other = await prisma.user.create({ data: { email: otherUserEmail } });
  otherUserId = other.id;

  // Created via separate `create()` calls with explicit createdAt values,
  // not a single createMany: Postgres evaluates now() once per statement,
  // so a createMany batch gives every row in it an IDENTICAL createdAt,
  // which breaks the "newest first" ordering assertion below.
  await prisma.savedJob.create({
    data: {
      userId: testUserId,
      title: "Dev 1",
      company: "Acme",
      portal: "linkedin",
      link: "https://x.com/1",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
    },
  });
  await prisma.savedJob.create({
    data: {
      userId: testUserId,
      title: "Dev 2",
      company: "Beta",
      portal: "bumeran",
      link: "https://x.com/2",
      createdAt: new Date("2024-01-02T00:00:00.000Z"),
    },
  });
  await prisma.savedJob.create({
    data: {
      userId: otherUserId,
      title: "Other job",
      company: "Gamma",
      portal: "linkedin",
      link: "https://x.com/3",
    },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { id: { in: [testUserId, otherUserId] } },
  });
});

function getRequest(userId: string | null): Request {
  const url = userId
    ? `http://localhost/api/jobs?userId=${userId}`
    : "http://localhost/api/jobs";
  return new Request(url, { method: "GET" });
}

describe("GET /api/jobs", () => {
  it("returns only the requested user's jobs, newest first", async () => {
    const response = await GET(getRequest(testUserId));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.jobs).toHaveLength(2);
    expect(json.jobs.map((j: { title: string }) => j.title)).toEqual([
      "Dev 2",
      "Dev 1",
    ]);
  });

  it("scopes results to the given user, not other users' jobs", async () => {
    const response = await GET(getRequest(otherUserId));
    const json = await response.json();
    expect(json.jobs).toHaveLength(1);
    expect(json.jobs[0].title).toBe("Other job");
  });

  it("rejects a missing userId with 400", async () => {
    const response = await GET(getRequest(null));
    expect(response.status).toBe(400);
  });
});
```

Note: `SavedJob` has `onDelete: Cascade` on its `User` relation (`prisma/schema.prisma`), so deleting the two test users in `afterAll` also removes the `SavedJob` rows created for them — no separate `savedJob.deleteMany` needed here.

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npx vitest run src/app/api/jobs/route.test.ts`
Expected: FAIL — `src/app/api/jobs/route.ts` does not exist yet.

- [ ] **Step 4: Implement `src/app/api/jobs/route.ts`**

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "Falta userId" }, { status: 400 });
  }

  try {
    const jobs = await prisma.savedJob.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ jobs }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/jobs error]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/app/api/jobs/route.test.ts`
Expected: PASS, 3/3 tests green, against the live Neon database.

- [ ] **Step 6: Confirm no leftover test data**

```bash
node --env-file=.env.local -e "const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); Promise.all([prisma.user.count({ where: { email: { contains: '@agentjob-test.local' } } }), prisma.savedJob.count({ where: { link: { contains: 'x.com' } } })]).then(([users, jobs]) => { console.log('users:', users, 'jobs:', jobs); process.exit(0); });"
```

Expected: `users: 0 jobs: 0`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/job-status.ts src/app/api/jobs/route.ts src/app/api/jobs/route.test.ts
git commit -m "$(cat <<'EOF'
feat: add GET /api/jobs endpoint and shared job-status constants

job-status.ts is the single source of truth for the three allowed
SavedJob status values, used by this endpoint's future PATCH sibling
and the dashboard page. GET /api/jobs scopes results to the given
userId and orders by createdAt descending. Integration-tested
against the live Neon database, including a check that one user's
request never returns another user's rows.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `PATCH /api/jobs/[id]` (live-DB integration test)

**Files:**
- Create: `src/app/api/jobs/[id]/route.ts`
- Create: `src/app/api/jobs/[id]/route.test.ts`

**Interfaces:**
- Consumes: `JOB_STATUSES` from `@/lib/job-status` (Task 1).
- Produces: `PATCH` handler returning `200` (the updated `SavedJob`) on success, `400` for a missing `userId` or invalid `status`, `404` when the job doesn't exist or belongs to a different user, `500` on unexpected DB error.

- [ ] **Step 1: Write the failing tests — `src/app/api/jobs/[id]/route.test.ts`**

```ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PATCH } from "./route";
import { prisma } from "@/lib/db";

let testUserId: string;
let otherUserId: string;
let jobId: string;
const testUserEmail = `test-jobs-patch-${Date.now()}@agentjob-test.local`;
const otherUserEmail = `test-jobs-patch-other-${Date.now()}@agentjob-test.local`;

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: testUserEmail } });
  testUserId = user.id;
  const other = await prisma.user.create({ data: { email: otherUserEmail } });
  otherUserId = other.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { id: { in: [testUserId, otherUserId] } },
  });
});

beforeEach(async () => {
  const job = await prisma.savedJob.create({
    data: {
      userId: testUserId,
      title: "Dev",
      company: "Acme",
      portal: "linkedin",
      link: "https://x.com/1",
    },
  });
  jobId = job.id;
});

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/jobs/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/jobs/[id]", () => {
  it("updates the status when the job belongs to the given user", async () => {
    const response = await PATCH(patchRequest({ userId: testUserId, status: "applied" }), {
      params: Promise.resolve({ id: jobId }),
    });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("applied");

    const saved = await prisma.savedJob.findUnique({ where: { id: jobId } });
    expect(saved?.status).toBe("applied");
  });

  it("rejects an invalid status value with 400 before writing", async () => {
    const response = await PATCH(
      patchRequest({ userId: testUserId, status: "not-a-real-status" }),
      { params: Promise.resolve({ id: jobId }) }
    );
    expect(response.status).toBe(400);

    const saved = await prisma.savedJob.findUnique({ where: { id: jobId } });
    expect(saved?.status).toBe("saved");
  });

  it("returns 404 and makes no change when the job belongs to a different user", async () => {
    const response = await PATCH(patchRequest({ userId: otherUserId, status: "applied" }), {
      params: Promise.resolve({ id: jobId }),
    });
    expect(response.status).toBe(404);

    const saved = await prisma.savedJob.findUnique({ where: { id: jobId } });
    expect(saved?.status).toBe("saved");
  });
});
```

Note: `beforeEach` creates a fresh job for every test; `afterAll` deleting the two users cascades away every job created along the way, so no explicit `savedJob` cleanup is needed here either.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run "src/app/api/jobs/[id]/route.test.ts"`
Expected: FAIL — `src/app/api/jobs/[id]/route.ts` does not exist yet.

- [ ] **Step 3: Implement `src/app/api/jobs/[id]/route.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run "src/app/api/jobs/[id]/route.test.ts"`
Expected: PASS, 3/3 tests green, against the live Neon database.

- [ ] **Step 5: Confirm no leftover test data**

```bash
node --env-file=.env.local -e "const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); prisma.user.count({ where: { email: { contains: '@agentjob-test.local' } } }).then((n) => { console.log('users:', n); process.exit(0); });"
```

Expected: `users: 0`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/jobs/[id]/route.ts" "src/app/api/jobs/[id]/route.test.ts"
git commit -m "$(cat <<'EOF'
feat: add PATCH /api/jobs/[id] endpoint

Updates a SavedJob's status after confirming it belongs to the
given userId (404, not 403, when it doesn't match or doesn't exist,
to avoid confirming cross-user id existence). Rejects invalid status
values before touching the database. Integration-tested against the
live Neon database, including the ownership-mismatch case.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `/dashboard` page

**Files:**
- Modify: `src/app/dashboard/page.tsx` (replacing the `.gitkeep` placeholder — delete the `.gitkeep` file as part of this task since the directory now has real content)

**Interfaces:**
- Consumes: `getStoredUser` from `@/lib/auth-storage`, `JOB_STATUSES`/`JobStatus` from `@/lib/job-status` (Task 1), calls `GET /api/jobs` (Task 1) and `PATCH /api/jobs/[id]` (Task 2).

No automated test for this task (React component with fetch) — verified via `npm run build` and a manual/browser end-to-end check, same pattern as prior UI tasks.

- [ ] **Step 1: Delete `src/app/dashboard/.gitkeep`**

- [ ] **Step 2: Create `src/app/dashboard/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { getStoredUser } from "@/lib/auth-storage";
import { JOB_STATUSES, type JobStatus } from "@/lib/job-status";

interface SavedJobRow {
  id: string;
  title: string;
  company: string;
  portal: string;
  link: string;
  status: string;
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<SavedJobRow[] | null>(null);
  const [error, setError] = useState("");
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const user = getStoredUser();
    if (!user) return;

    fetch(`/api/jobs?userId=${user.id}`)
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => setJobs(data.jobs))
      .catch(() => setError("No se pudieron cargar tus postulaciones."));
  }, []);

  async function handleStatusChange(jobId: string, newStatus: JobStatus) {
    const user = getStoredUser();
    if (!user || !jobs) return;

    const previous = jobs.find((j) => j.id === jobId)?.status;
    setJobs(jobs.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j)));
    setRowErrors((prev) => ({ ...prev, [jobId]: "" }));

    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, status: newStatus }),
      });

      if (!response.ok) {
        throw new Error("failed");
      }
    } catch {
      setJobs((current) =>
        current
          ? current.map((j) =>
              j.id === jobId ? { ...j, status: previous ?? j.status } : j
            )
          : current
      );
      setRowErrors((prev) => ({
        ...prev,
        [jobId]: "No se pudo actualizar el estado.",
      }));
    }
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-dark-950 text-magenta-400">
        {error}
      </main>
    );
  }

  if (jobs === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-dark-950 text-white">
        Cargando...
      </main>
    );
  }

  if (jobs.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-dark-950 text-white">
        <p className="text-dark-200">Todavia no tenes postulaciones guardadas.</p>
        <a href="/upload" className="text-cyan-400 hover:text-cyan-300">
          Subir un Excel
        </a>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-dark-950 px-4 py-16 text-white">
      <h1 className="mb-6 text-3xl font-bold">Tus postulaciones</h1>
      <table className="w-full max-w-4xl text-left text-dark-200">
        <thead>
          <tr className="border-b border-dark-700 text-sm text-dark-400">
            <th className="py-2 pr-4">Titulo</th>
            <th className="py-2 pr-4">Empresa</th>
            <th className="py-2 pr-4">Portal</th>
            <th className="py-2 pr-4">Estado</th>
            <th className="py-2 pr-4">Link</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b border-dark-800">
              <td className="py-2 pr-4">{job.title}</td>
              <td className="py-2 pr-4">{job.company}</td>
              <td className="py-2 pr-4">{job.portal}</td>
              <td className="py-2 pr-4">
                <select
                  value={job.status}
                  onChange={(e) =>
                    handleStatusChange(job.id, e.target.value as JobStatus)
                  }
                  className="rounded bg-dark-800 px-2 py-1 text-white"
                >
                  {JOB_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                {rowErrors[job.id] && (
                  <p className="text-xs text-magenta-400">{rowErrors[job.id]}</p>
                )}
              </td>
              <td className="py-2 pr-4">
                <a
                  href={job.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:text-cyan-300"
                >
                  Ver
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 3: Verify the project builds**

Run: `npm run build`
Expected: exit 0, route list includes `/dashboard`.

- [ ] **Step 4: Manual end-to-end verification**

Run `npm run dev` and, with a browser (or `curl` against the running dev server plus a one-off Prisma script if browser automation is unavailable — same documented caveat as prior UI tasks):

1. Confirm a user with zero `SavedJob` rows sees the empty-state message and a working link to `/upload`.
2. Upload a small `.xlsx` (via `/upload`) to create a few rows, then visit `/dashboard` — confirm the table renders with the right titles/companies/portals/links.
3. Change one row's status dropdown — confirm it persists (refresh the page or re-fetch and check the value stuck).
4. If feasible, simulate a failed update (e.g., temporarily stop the dev server mid-request, or note this is hard to force without a browser) and note in your report whether you could verify the revert-on-failure behavior or only the happy path.
5. Clean up any test data created (`SavedJob` rows, and the `User` row if you created a fresh test user for this) via one-off Prisma scripts.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx
git rm src/app/dashboard/.gitkeep
git commit -m "$(cat <<'EOF'
feat: add /dashboard page

Lists the user's SavedJob rows (title, company, portal, status,
link), with an inline status dropdown per row calling PATCH
/api/jobs/[id], and an empty-state message pointing to /upload when
there's nothing saved yet.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: exit 0. Test count should be 25 (auth + excel-upload) + 3 (`jobs/route.test.ts`) + 3 (`jobs/[id]/route.test.ts`) = 31.

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

- Shared status constants → Task 1.
- `GET /api/jobs` scoped + ordered → Task 1, tested (including cross-user isolation).
- `PATCH /api/jobs/[id]` with ownership check, 404-not-403, invalid-status rejection → Task 2, tested.
- Dashboard table + inline status change + empty state → Task 3.
- Out-of-scope items (filters, sorting, pagination, field edits beyond status, row deletion, UserProfile/Application/PortalSync UI) → absent from all tasks, confirmed by design.
- Acceptance criteria (lint/test/build pass, scoped GET, 404 on mismatched PATCH, empty state, status persists, no leftover test data) → Tasks 1-4.
