# Auth (Email + localStorage) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give agent-job a minimal identity layer (email + localStorage, no password/session tokens) so every other feature can scope data to a real `User` row, per the approved design spec.

**Architecture:** A single `POST /api/auth` route does a Prisma `upsert` on `User` by email. The client caches `{id, email}` in localStorage via small helper functions, gates the entire app behind an `AuthGate` client component mounted in the root layout, and shows an `EmailGateModal` (no dismiss option) until a user is identified. A `Cerrar sesion` control clears localStorage and re-shows the modal.

**Tech Stack:** Next.js 16 App Router route handlers, Prisma 6 (`User` model already exists), Zod 4, Vitest (new — first test framework in this repo) + jsdom for localStorage tests, a live Neon Postgres database (already pushed via `prisma db push`).

## Global Constraints

- No password, session tokens, or email verification — this is a deliberately minimal MVP identity mechanism, matching AgenticSec's zero-friction pattern but with a real `User` row instead of a raw string.
- Email is mandatory: no "continue without email" dismiss option anywhere.
- The gate lives in `src/app/layout.tsx`, wrapping the entire app, not a specific route.
- `POST /api/auth` is the only place that creates/finds `User` rows (`upsert` by `email`, which has an existing `@unique` constraint in `prisma/schema.prisma`). Future routes will accept an already-resolved `userId` from the client and trust it directly — not built in this plan.
- localStorage keys: `agentjob_user_id` and `agentjob_user_email` (exact names, used by both the implementation and its tests).
- A live `DATABASE_URL` is now configured in the gitignored `.env.local` at the repo root, and `prisma db push` has already synced the schema to it — the integration test in Task 3 depends on this being reachable.
- Any test that writes to the live database MUST clean up the rows it created (scope deletes to a uniquely generated test email per test run) — this is a shared real database, not a disposable test instance.
- Commit messages must end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Test infrastructure (Vitest) + email validator

**Files:**
- Modify: `package.json` (add `vitest`, `jsdom` devDependencies and a `test` script)
- Create: `vitest.config.ts`
- Modify: `src/lib/validators.ts` (currently empty — first real content)
- Create: `src/lib/validators.test.ts`

**Interfaces:**
- Produces: `emailSchema` (a Zod object schema `{ email: string }`) and `EmailInput` type, exported from `@/lib/validators`, consumed by Task 3's API route.

- [ ] **Step 1: Add test dependencies to `package.json`**

Add to `devDependencies` (alongside the existing entries from the Day 1 scaffold — do not remove or reorder existing ones):

```json
"jsdom": "^25.0.1",
"vitest": "^2.1.8"
```

Add to `scripts` (alongside existing scripts):

```json
"test": "vitest run"
```

- [ ] **Step 2: Install the new dependencies**

Run: `npm install`
Expected: exit 0, `vitest` and `jsdom` appear under `node_modules`.

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { config } from "dotenv";
import path from "path";

config({ path: path.join(process.cwd(), ".env.local") });

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
  },
});
```

- [ ] **Step 4: Write the failing test — `src/lib/validators.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { emailSchema } from "./validators";

describe("emailSchema", () => {
  it("accepts a valid email", () => {
    const result = emailSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(true);
  });

  it("rejects a string with no @", () => {
    const result = emailSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = emailSchema.safeParse({ email: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing email field", () => {
    const result = emailSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 5: Run the test and confirm it fails**

Run: `npx vitest run src/lib/validators.test.ts`
Expected: FAIL — `src/lib/validators.ts` is currently empty, so `emailSchema` is undefined/not exported.

- [ ] **Step 6: Implement `src/lib/validators.ts`**

```ts
import { z } from "zod";

export const emailSchema = z.object({
  email: z.string().email("Email invalido"),
});

export type EmailInput = z.infer<typeof emailSchema>;
```

- [ ] **Step 7: Run the test and confirm it passes**

Run: `npx vitest run src/lib/validators.test.ts`
Expected: PASS, 4/4 tests green.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/validators.ts src/lib/validators.test.ts
git commit -m "$(cat <<'EOF'
feat: add vitest and email validator schema

First test framework in this repo (jsdom environment for later
localStorage tests). emailSchema is the first real content in
src/lib/validators.ts, which was an intentional empty stub since the
Day 1 scaffold.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Client-side auth storage helpers

**Files:**
- Create: `src/lib/auth-storage.ts`
- Create: `src/lib/auth-storage.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `StoredUser` interface (`{ id: string; email: string }`), `getStoredUser(): StoredUser | null`, `setStoredUser(user: StoredUser): void`, `clearStoredUser(): void` — all exported from `@/lib/auth-storage`, consumed by Task 4 (`EmailGateModal`) and Task 5 (`AuthGate`).

- [ ] **Step 1: Write the failing tests — `src/lib/auth-storage.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getStoredUser, setStoredUser, clearStoredUser } from "./auth-storage";

describe("auth-storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when nothing is stored", () => {
    expect(getStoredUser()).toBeNull();
  });

  it("stores and retrieves a user", () => {
    setStoredUser({ id: "abc123", email: "user@example.com" });
    expect(getStoredUser()).toEqual({ id: "abc123", email: "user@example.com" });
  });

  it("returns null after clearing", () => {
    setStoredUser({ id: "abc123", email: "user@example.com" });
    clearStoredUser();
    expect(getStoredUser()).toBeNull();
  });

  it("returns null if only the id is present without an email", () => {
    localStorage.setItem("agentjob_user_id", "abc123");
    expect(getStoredUser()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/lib/auth-storage.test.ts`
Expected: FAIL — `src/lib/auth-storage.ts` does not exist yet.

- [ ] **Step 3: Implement `src/lib/auth-storage.ts`**

```ts
export interface StoredUser {
  id: string;
  email: string;
}

const ID_KEY = "agentjob_user_id";
const EMAIL_KEY = "agentjob_user_email";

export function getStoredUser(): StoredUser | null {
  const id = localStorage.getItem(ID_KEY);
  const email = localStorage.getItem(EMAIL_KEY);
  if (!id || !email) return null;
  return { id, email };
}

export function setStoredUser(user: StoredUser): void {
  localStorage.setItem(ID_KEY, user.id);
  localStorage.setItem(EMAIL_KEY, user.email);
}

export function clearStoredUser(): void {
  localStorage.removeItem(ID_KEY);
  localStorage.removeItem(EMAIL_KEY);
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/auth-storage.test.ts`
Expected: PASS, 4/4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth-storage.ts src/lib/auth-storage.test.ts
git commit -m "$(cat <<'EOF'
feat: add client-side auth storage helpers

getStoredUser/setStoredUser/clearStoredUser wrap the two localStorage
keys (agentjob_user_id, agentjob_user_email) used to cache the
identified user across page loads.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `POST /api/auth` route (live-DB integration test)

**Files:**
- Create: `src/app/api/auth/route.ts`
- Create: `src/app/api/auth/route.test.ts`

**Interfaces:**
- Consumes: `emailSchema` from `@/lib/validators` (Task 1), `prisma` from `@/lib/db` (already exists from the Day 1 scaffold).
- Produces: `POST` handler returning `200 { id: string, email: string }` on success, `400 { error: string }` on invalid input, `500 { error: string }` on unexpected DB error. This is the exact response shape Task 4's `EmailGateModal` will consume.

This test hits the live Neon database configured in `.env.local` — there is no mock. Every test MUST delete the rows it creates.

- [ ] **Step 1: Write the failing tests — `src/app/api/auth/route.test.ts`**

```ts
// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { POST } from "./route";
import { prisma } from "@/lib/db";

const testEmails: string[] = [];

function uniqueEmail(): string {
  const email = `test-${Date.now()}-${Math.random().toString(36).slice(2)}@agentjob-test.local`;
  testEmails.push(email);
  return email;
}

afterEach(async () => {
  if (testEmails.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
    testEmails.length = 0;
  }
});

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth", () => {
  it("creates a new user for a new email", async () => {
    const email = uniqueEmail();
    const response = await POST(postRequest({ email }));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.email).toBe(email);
    expect(typeof json.id).toBe("string");
  });

  it("returns the same user id on a second call with the same email", async () => {
    const email = uniqueEmail();
    const first = await POST(postRequest({ email }));
    const firstJson = await first.json();
    const second = await POST(postRequest({ email }));
    const secondJson = await second.json();
    expect(secondJson.id).toBe(firstJson.id);
  });

  it("rejects an invalid email with 400", async () => {
    const response = await POST(postRequest({ email: "not-an-email" }));
    expect(response.status).toBe(400);
  });

  it("rejects a missing email field with 400", async () => {
    const response = await POST(postRequest({}));
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/app/api/auth/route.test.ts`
Expected: FAIL — `src/app/api/auth/route.ts` does not exist yet.

- [ ] **Step 3: Implement `src/app/api/auth/route.ts`**

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { emailSchema } from "@/lib/validators";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  }

  const parsed = emailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Email invalido" }, { status: 400 });
  }

  try {
    const user = await prisma.user.upsert({
      where: { email: parsed.data.email },
      update: {},
      create: { email: parsed.data.email },
    });
    return NextResponse.json({ id: user.id, email: user.email }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/auth error]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/app/api/auth/route.test.ts`
Expected: PASS, 4/4 tests green, against the live Neon database.

- [ ] **Step 5: Confirm no test rows were left behind**

Run this one-off check (plain `node`, no `tsx`/`ts-node` needed — `@prisma/client` is already-compiled JS) and confirm it prints `0`:

```bash
node -e "const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); prisma.user.count({ where: { email: { contains: '@agentjob-test.local' } } }).then((n) => { console.log(n); process.exit(0); });"
```

Expected: `0` (the `afterEach` cleanup deleted every test-created row).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/auth/route.ts src/app/api/auth/route.test.ts
git commit -m "$(cat <<'EOF'
feat: add POST /api/auth upsert endpoint

Finds or creates a User by email. This is the only place User rows
get created; other future routes will trust an already-resolved
userId from the client instead of re-deriving it. Integration-tested
against the live Neon database with self-cleaning test emails.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `EmailGateModal` component

**Files:**
- Create: `src/components/sections/EmailGateModal.tsx`

**Interfaces:**
- Consumes: `StoredUser` type from `@/lib/auth-storage` (Task 2).
- Produces: `EmailGateModal({ onSuccess: (user: StoredUser) => void })` — a client component, consumed by Task 5's `AuthGate`.

No automated test for this task (React component with `fetch` and DOM interaction) — verified via `npm run build` (Step 2) and manual browser verification bundled into Task 5's end-to-end check, since this component only renders meaningfully inside `AuthGate`.

- [ ] **Step 1: Create `src/components/sections/EmailGateModal.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { StoredUser } from "@/lib/auth-storage";

interface EmailGateModalProps {
  onSuccess: (user: StoredUser) => void;
}

export function EmailGateModal({ onSuccess }: EmailGateModalProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Ingresa un email valido");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        setError("No se pudo conectar. Intenta de nuevo.");
        setLoading(false);
        return;
      }

      const user = (await response.json()) as StoredUser;
      onSuccess(user);
    } catch {
      setError("No se pudo conectar. Intenta de nuevo.");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-dark-700 rounded-lg max-w-md w-full p-8">
        <h2 className="text-2xl font-bold text-white mb-2">Bienvenido a agent-job</h2>
        <p className="text-dark-300 mb-6">
          Ingresa tu email para empezar a organizar tu busqueda de empleo.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-dark-200 text-sm font-semibold mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="w-full px-4 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-cyan-400"
              disabled={loading}
            />
            {error && <p className="text-magenta-400 text-sm mt-2">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-cyan-400 text-dark-950 font-semibold py-2 rounded-lg hover:bg-cyan-300 transition-colors disabled:opacity-50"
          >
            {loading ? "Ingresando..." : "Comenzar"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the project still builds**

Run: `npm run build`
Expected: exit 0. (This component isn't wired into any page yet, but it must type-check and compile cleanly.)

- [ ] **Step 3: Commit**

```bash
git add src/components/sections/EmailGateModal.tsx
git commit -m "$(cat <<'EOF'
feat: add EmailGateModal component

No dismiss option (email is mandatory). Calls POST /api/auth and
reports the resolved {id, email} via onSuccess; not wired into the
app yet (Task 5 does that).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `AuthGate` component, wired into the root layout

**Files:**
- Create: `src/components/sections/AuthGate.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `EmailGateModal` (Task 4), `getStoredUser`/`setStoredUser`/`clearStoredUser`/`StoredUser` from `@/lib/auth-storage` (Task 2).
- Produces: `AuthGate({ children: React.ReactNode })` — wraps the whole app in `src/app/layout.tsx`.

This is the task where the full flow becomes observable end-to-end. No automated test (React state + browser localStorage) — verified manually per Step 3 below.

- [ ] **Step 1: Create `src/components/sections/AuthGate.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { EmailGateModal } from "./EmailGateModal";
import {
  getStoredUser,
  setStoredUser,
  clearStoredUser,
  type StoredUser,
} from "@/lib/auth-storage";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<StoredUser | null | undefined>(undefined);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  if (user === undefined) {
    return null;
  }

  if (user === null) {
    return (
      <EmailGateModal
        onSuccess={(newUser) => {
          setStoredUser(newUser);
          setUser(newUser);
        }}
      />
    );
  }

  return (
    <>
      <div className="flex items-center justify-end gap-4 border-b border-dark-700 bg-dark-900 px-6 py-3 text-sm text-dark-300">
        <span>{user.email}</span>
        <button
          onClick={() => {
            clearStoredUser();
            setUser(null);
          }}
          className="text-cyan-400 hover:text-cyan-300"
        >
          Cerrar sesion
        </button>
      </div>
      {children}
    </>
  );
}
```

- [ ] **Step 2: Modify `src/app/layout.tsx` to wrap `children` with `AuthGate`**

Replace the file's body with:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { AuthGate } from "@/components/sections/AuthGate";

export const metadata: Metadata = {
  title: "agent-job - Automatizacion de Busqueda de Empleo",
  description:
    "Plataforma de automatizacion de busqueda de empleo: optimizacion de CV por IA, sincronizacion de portales y seguimiento de postulaciones.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Manual end-to-end verification**

Run: `npm run build` first (expect exit 0), then `npm run dev` and, in a browser, visit `http://localhost:3000` (or whatever port Next.js picks if 3000 is busy) with the site's localStorage cleared:

1. Confirm ONLY the email modal is visible — no page content behind it, no way to dismiss it.
2. Submit an invalid string (e.g. `notanemail`) — confirm the inline "Ingresa un email valido" error appears and no network request fires.
3. Submit a real, new email address — confirm the modal closes, the placeholder home page becomes visible, and a top bar shows that email plus a "Cerrar sesion" link.
4. Refresh the page — confirm the app loads directly (no modal), since the user is now cached in localStorage.
5. Click "Cerrar sesion" — confirm the modal reappears and the page content is hidden again.
6. Re-submit the same email used in step 3 — confirm it succeeds again (upsert, not a duplicate-key error) and the same top bar reappears.

If Chrome browser automation is unavailable in this environment, perform steps 1-6 with `curl` against `/api/auth` directly to validate the backend half (status codes, upsert idempotency — this overlaps with Task 3's automated tests, so treat it as a sanity re-check, not new coverage) and ask the user to click through steps 1-6 themselves in their own browser, reporting back any visual issues.

- [ ] **Step 4: Commit**

```bash
git add src/components/sections/AuthGate.tsx src/app/layout.tsx
git commit -m "$(cat <<'EOF'
feat: wire AuthGate into the root layout

The whole app is now gated behind email identification: no stored
user shows only the modal, a stored user shows the app plus a
top bar with their email and a logout control.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: exit 0, all tests from Tasks 1-3 passing (12 tests: 4 validators + 4 auth-storage + 4 route).

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Confirm the live database has no leftover test rows**

Run the same one-off check as Task 3 Step 5:

```bash
node -e "const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); prisma.user.count({ where: { email: { contains: '@agentjob-test.local' } } }).then((n) => { console.log(n); process.exit(0); });"
```

Expected: `0`.

- [ ] **Step 5: Confirm git history**

Run: `git log --oneline`
Expected: the 5 feature commits from Tasks 1-5 are present on top of the branch's base.

---

## Spec coverage check

- Email mandatory, no anonymous mode → Task 4 (no dismiss button), Task 5 Step 3 verification.
- Gate lives in root layout → Task 5 Step 2.
- Single `POST /api/auth` upsert endpoint → Task 3.
- `emailSchema` for validation (client and server) → Task 1, consumed by both `EmailGateModal` (Task 4, client-side regex + this schema conceptually mirrored) and the route (Task 3, server-side).
- localStorage helpers with the exact specified keys → Task 2.
- Logout control → Task 5.
- Acceptance criteria (lint/build pass, modal-only when unauthenticated, upsert not duplicate, logout works) → Tasks 1-6.
- Out of scope (passwords, sessions, email verification, rate limiting, account settings UI) → not present in any task above.
