# Agente de IA: optimización de CV/perfil por portal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user write one free-text "base profile", pick a portal (LinkedIn or Bumeran), and have a Claude-powered agent generate a portal-optimized `headline` + `summary`, auto-saved to `UserProfile`.

**Architecture:** A new `rawProfile` field on `User` holds the free-text input. Three new endpoints under `src/app/api/profiles/` read/write it and drive a new structured-output agent helper (`executeStructuredAgent` in `src/lib/agents/claude.ts`) that asks Claude for JSON and validates it with Zod. A new `/profile` page provides the UI; `AuthGate` gets a small nav bar linking `/dashboard`, `/upload`, `/profile`.

**Tech Stack:** Next.js 16 App Router route handlers, Prisma 6 (Neon Postgres), Zod 4, `@anthropic-ai/sdk` (model `claude-3-5-sonnet-20241022`, already used by `executeAgent`), Vitest 2 (jsdom globally, `// @vitest-environment node` per API-route test file, matching every existing test in this repo).

## Global Constraints

- MVP security model: every endpoint trusts a client-supplied `userId` with no session/token verification — only existence/ownership checks (404 on mismatch or missing user). Do not add auth infrastructure.
- Error responses follow the existing shape `{ error: string }` with Spanish messages, matching `src/app/api/jobs/**/route.ts` and `src/app/api/auth/route.ts`.
- Styling matches existing pages exactly: `bg-dark-950` page background, `text-white` primary text, `text-dark-200/300/400` secondary text, `bg-cyan-400`/`hover:bg-cyan-300`/`text-dark-950` primary buttons, `text-magenta-400` for errors, `border-dark-700`/`border-dark-800` for dividers, `disabled:opacity-50` on disabled buttons.
- No component/page tests — this repo only unit/integration-tests API routes and library functions (`*.route.test.ts`, `src/lib/agents/claude.test.ts`), never `.tsx` pages/components. Follow that convention; do not add page tests.
- Integration tests hit the real Neon database via `prisma` (no DB mocking) — only the Anthropic agent call itself is mocked, using `vi.hoisted` + `vi.mock`, matching no prior pattern in this repo exactly but following the same test-file shape (`// @vitest-environment node`, `beforeAll`/`afterAll`/`beforeEach` cleanup, unique emails under `@agentjob-test.local`).
- `ANTHROPIC_API_KEY` is not yet set on Vercel (Preview or Production) — must be added before this feature is deployed.

---

### Task 1: Schema — `User.rawProfile` and a unique constraint on `UserProfile`

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `User.rawProfile: String | null` (Prisma field), and a unique constraint named `userId_portal` on `UserProfile` (Prisma's default compound-unique name for `@@unique([userId, portal])`), which Task 5's `prisma.userProfile.upsert({ where: { userId_portal: { userId, portal } }, ... })` depends on.

- [ ] **Step 1: Add `rawProfile` to `User` and a compound unique constraint to `UserProfile`**

In `prisma/schema.prisma`, add `rawProfile` to the `User` model (anywhere among the scalar fields, e.g. right after `bumeranToken`):

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String?
  linkedinToken String?
  bumeranToken  String?
  rawProfile    String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  profiles      UserProfile[]
  savedJobs     SavedJob[]
  applications  Application[]
  portalSyncs   PortalSync[]
}
```

And add a compound unique constraint to `UserProfile` (keep the existing indexes):

```prisma
model UserProfile {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  portal     String
  headline   String?
  summary    String?
  resumeData Json?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([userId])
  @@index([portal])
  @@unique([userId, portal])
}
```

- [ ] **Step 2: Push the schema to Neon and regenerate the client**

Run:
```bash
npx prisma db push
npx prisma generate
```
Expected: `npx prisma db push` prints `Your database is now in sync with your Prisma schema.` with no errors; `npx prisma generate` regenerates `@prisma/client` with the new `rawProfile` field and the `userId_portal` compound key type.

- [ ] **Step 3: Run the existing test suite to confirm nothing broke**

Run: `npm run test`
Expected: all existing tests still PASS (this step only touches schema; no existing code references the new field yet).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add User.rawProfile and unique userId+portal constraint on UserProfile"
```

---

### Task 2: `executeStructuredAgent` in `src/lib/agents/claude.ts`

**Files:**
- Modify: `src/lib/agents/claude.ts`
- Test: `src/lib/agents/claude.test.ts` (new)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `executeStructuredAgent<T>(params: { agentInstructions: string; userQuery: string; schema: z.ZodType<T>; maxTokens?: number; temperature?: number }): Promise<T>`, exported from `src/lib/agents/claude.ts`. Task 5 imports this exact signature.

- [ ] **Step 1: Write the failing test**

Create `src/lib/agents/claude.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

import { executeStructuredAgent } from "./claude";

const schema = z.object({ headline: z.string(), summary: z.string() });

beforeEach(() => {
  mockCreate.mockReset();
});

describe("executeStructuredAgent", () => {
  it("parses and validates a JSON response against the schema", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: "text", text: '{"headline":"Dev Senior","summary":"5 anios de experiencia."}' },
      ],
    });

    const result = await executeStructuredAgent({
      agentInstructions: "system prompt",
      userQuery: "raw profile text",
      schema,
    });

    expect(result).toEqual({
      headline: "Dev Senior",
      summary: "5 anios de experiencia.",
    });
  });

  it("throws when Claude does not return valid JSON", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "not json at all" }],
    });

    await expect(
      executeStructuredAgent({
        agentInstructions: "system prompt",
        userQuery: "raw profile text",
        schema,
      })
    ).rejects.toThrow();
  });

  it("throws when the JSON does not match the schema", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"headline":"Dev Senior"}' }],
    });

    await expect(
      executeStructuredAgent({
        agentInstructions: "system prompt",
        userQuery: "raw profile text",
        schema,
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/agents/claude.test.ts`
Expected: FAIL — `executeStructuredAgent` is not exported from `./claude` (import error / undefined function).

- [ ] **Step 3: Implement `executeStructuredAgent`**

In `src/lib/agents/claude.ts`, add the `z` import and the new function, leaving the existing `executeAgent` untouched:

```ts
import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// ... existing ExecuteAgentParams, ExecuteAgentResponse, executeAgent stay as-is ...

export interface ExecuteStructuredAgentParams<T> {
  agentInstructions: string
  userQuery: string
  schema: z.ZodType<T>
  maxTokens?: number
  temperature?: number
}

export async function executeStructuredAgent<T>({
  agentInstructions,
  userQuery,
  schema,
  maxTokens = 1000,
  temperature = 0.7,
}: ExecuteStructuredAgentParams<T>): Promise<T> {
  const message = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: maxTokens,
    temperature,
    system: agentInstructions,
    messages: [
      {
        role: "user",
        content: userQuery,
      },
    ],
  })

  const textContent = message.content.find((c) => c.type === "text")
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text response from Claude")
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(textContent.text)
  } catch {
    throw new Error("Claude no devolvio un JSON valido")
  }

  return schema.parse(parsedJson)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/agents/claude.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/claude.ts src/lib/agents/claude.test.ts
git commit -m "feat: add executeStructuredAgent for JSON+Zod-validated Claude responses"
```

---

### Task 3: `GET /api/profiles`

**Files:**
- Create: `src/app/api/profiles/route.ts`
- Test: `src/app/api/profiles/route.test.ts`
- Delete: `src/app/api/profiles/.gitkeep` (no longer an empty directory)

**Interfaces:**
- Consumes: `prisma` from `@/lib/db` (existing).
- Produces: `GET` handler returning `200 { rawProfile: string | null, profiles: UserProfile[] }`, `400 { error }` when `userId` query param is missing, `404 { error }` when the user doesn't exist. Task 6 (UI) fetches this exact shape.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/profiles/route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { GET } from "./route";
import { prisma } from "@/lib/db";

let testUserId: string;
const testUserEmail = `test-profiles-get-${Date.now()}@agentjob-test.local`;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: testUserEmail, rawProfile: "Desarrollador con 5 anios de experiencia." },
  });
  testUserId = user.id;
  await prisma.userProfile.create({
    data: {
      userId: testUserId,
      portal: "linkedin",
      headline: "Dev Senior",
      summary: "Resumen existente.",
    },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: testUserId } });
});

function getRequest(query: string): Request {
  return new Request(`http://localhost/api/profiles${query}`);
}

describe("GET /api/profiles", () => {
  it("returns the raw profile and existing portal profiles for the user", async () => {
    const response = await GET(getRequest(`?userId=${testUserId}`));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.rawProfile).toBe("Desarrollador con 5 anios de experiencia.");
    expect(json.profiles).toHaveLength(1);
    expect(json.profiles[0]).toMatchObject({ portal: "linkedin", headline: "Dev Senior" });
  });

  it("returns 400 when userId is missing", async () => {
    const response = await GET(getRequest(""));
    expect(response.status).toBe(400);
  });

  it("returns 404 when the user does not exist", async () => {
    const response = await GET(getRequest("?userId=does-not-exist"));
    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/profiles/route.test.ts`
Expected: FAIL — `src/app/api/profiles/route.ts` doesn't exist yet.

- [ ] **Step 3: Implement the endpoint**

Delete `src/app/api/profiles/.gitkeep` and create `src/app/api/profiles/route.ts`:

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
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const profiles = await prisma.userProfile.findMany({ where: { userId } });
    return NextResponse.json(
      { rawProfile: user.rawProfile, profiles },
      { status: 200 }
    );
  } catch (error) {
    console.error("[GET /api/profiles error]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/api/profiles/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/profiles/route.ts src/app/api/profiles/route.test.ts
git rm src/app/api/profiles/.gitkeep
git commit -m "feat: add GET /api/profiles endpoint"
```

---

### Task 4: `PUT /api/profiles/base`

**Files:**
- Create: `src/app/api/profiles/base/route.ts`
- Test: `src/app/api/profiles/base/route.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/db`.
- Produces: `PUT` handler returning `200 { id: string, rawProfile: string }`, `400 { error }` on missing/empty `userId`/`rawProfile`, `404 { error }` when the user doesn't exist. Task 6 (UI) calls this to persist the base profile textarea.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/profiles/base/route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PUT } from "./route";
import { prisma } from "@/lib/db";

let testUserId: string;
const testUserEmail = `test-profiles-base-${Date.now()}@agentjob-test.local`;

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: testUserEmail } });
  testUserId = user.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: testUserId } });
});

function putRequest(body: unknown): Request {
  return new Request("http://localhost/api/profiles/base", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/profiles/base", () => {
  it("saves the raw profile text for the user", async () => {
    const response = await PUT(
      putRequest({ userId: testUserId, rawProfile: "Mi experiencia y skills." })
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.rawProfile).toBe("Mi experiencia y skills.");

    const saved = await prisma.user.findUnique({ where: { id: testUserId } });
    expect(saved?.rawProfile).toBe("Mi experiencia y skills.");
  });

  it("rejects an empty rawProfile with 400", async () => {
    const response = await PUT(putRequest({ userId: testUserId, rawProfile: "" }));
    expect(response.status).toBe(400);
  });

  it("rejects a missing userId with 400", async () => {
    const response = await PUT(putRequest({ rawProfile: "Texto." }));
    expect(response.status).toBe(400);
  });

  it("returns 404 when the user does not exist", async () => {
    const response = await PUT(
      putRequest({ userId: "does-not-exist", rawProfile: "Texto." })
    );
    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/profiles/base/route.test.ts`
Expected: FAIL — `src/app/api/profiles/base/route.ts` doesn't exist yet.

- [ ] **Step 3: Implement the endpoint**

Create `src/app/api/profiles/base/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const baseSchema = z.object({
  userId: z.string().min(1),
  rawProfile: z.string().min(1, "El perfil no puede estar vacio"),
});

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  }

  const parsed = baseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "userId o rawProfile invalido" }, { status: 400 });
  }
  const { userId, rawProfile } = parsed.data;

  try {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { rawProfile },
    });
    return NextResponse.json({ id: user.id, rawProfile: user.rawProfile }, { status: 200 });
  } catch (error) {
    console.error("[PUT /api/profiles/base error]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/api/profiles/base/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/profiles/base/route.ts src/app/api/profiles/base/route.test.ts
git commit -m "feat: add PUT /api/profiles/base endpoint"
```

---

### Task 5: `POST /api/profiles/optimize`

**Files:**
- Create: `src/app/api/profiles/optimize/route.ts`
- Test: `src/app/api/profiles/optimize/route.test.ts`

**Interfaces:**
- Consumes: `executeStructuredAgent` from `@/lib/agents/claude` (Task 2's exact signature); `prisma` from `@/lib/db`; the `userId_portal` compound unique key from Task 1.
- Produces: `POST` handler returning `200 UserProfile` (the upserted row), `400 { error }` on invalid body or missing base profile, `404 { error }` when the user doesn't exist, `500 { error }` when the agent call fails. Task 6 (UI) calls this to trigger optimization.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/profiles/optimize/route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";

const { mockExecuteStructuredAgent } = vi.hoisted(() => ({
  mockExecuteStructuredAgent: vi.fn(),
}));

vi.mock("@/lib/agents/claude", () => ({
  executeStructuredAgent: mockExecuteStructuredAgent,
}));

import { POST } from "./route";

let userWithProfileId: string;
let userWithoutProfileId: string;
const emailWith = `test-profiles-optimize-with-${Date.now()}@agentjob-test.local`;
const emailWithout = `test-profiles-optimize-without-${Date.now()}@agentjob-test.local`;

beforeAll(async () => {
  const withProfile = await prisma.user.create({
    data: { email: emailWith, rawProfile: "Desarrollador con 5 anios de experiencia." },
  });
  userWithProfileId = withProfile.id;

  const withoutProfile = await prisma.user.create({ data: { email: emailWithout } });
  userWithoutProfileId = withoutProfile.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { id: { in: [userWithProfileId, userWithoutProfileId] } },
  });
});

beforeEach(() => {
  mockExecuteStructuredAgent.mockReset();
});

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/profiles/optimize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/profiles/optimize", () => {
  it("generates and upserts the optimized profile for the portal", async () => {
    mockExecuteStructuredAgent.mockResolvedValueOnce({
      headline: "Dev Senior",
      summary: "Resumen generado.",
    });

    const response = await POST(
      postRequest({ userId: userWithProfileId, portal: "linkedin" })
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.headline).toBe("Dev Senior");
    expect(json.summary).toBe("Resumen generado.");

    const saved = await prisma.userProfile.findUnique({
      where: { userId_portal: { userId: userWithProfileId, portal: "linkedin" } },
    });
    expect(saved?.headline).toBe("Dev Senior");
  });

  it("overwrites an existing profile for the same user+portal on a second call", async () => {
    mockExecuteStructuredAgent.mockResolvedValueOnce({
      headline: "Primera version",
      summary: "Primer resumen.",
    });
    await POST(postRequest({ userId: userWithProfileId, portal: "bumeran" }));

    mockExecuteStructuredAgent.mockResolvedValueOnce({
      headline: "Segunda version",
      summary: "Segundo resumen.",
    });
    const response = await POST(
      postRequest({ userId: userWithProfileId, portal: "bumeran" })
    );
    expect(response.status).toBe(200);

    const rows = await prisma.userProfile.findMany({
      where: { userId: userWithProfileId, portal: "bumeran" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].headline).toBe("Segunda version");
  });

  it("returns 400 when the user has no rawProfile saved", async () => {
    const response = await POST(
      postRequest({ userId: userWithoutProfileId, portal: "linkedin" })
    );
    expect(response.status).toBe(400);
    expect(mockExecuteStructuredAgent).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid portal", async () => {
    const response = await POST(
      postRequest({ userId: userWithProfileId, portal: "not-a-portal" })
    );
    expect(response.status).toBe(400);
  });

  it("returns 404 when the user does not exist", async () => {
    const response = await POST(
      postRequest({ userId: "does-not-exist", portal: "linkedin" })
    );
    expect(response.status).toBe(404);
  });

  it("returns 500 when the agent call fails", async () => {
    mockExecuteStructuredAgent.mockRejectedValueOnce(new Error("agent down"));
    const response = await POST(
      postRequest({ userId: userWithProfileId, portal: "linkedin" })
    );
    expect(response.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/profiles/optimize/route.test.ts`
Expected: FAIL — `src/app/api/profiles/optimize/route.ts` doesn't exist yet.

- [ ] **Step 3: Implement the endpoint**

Create `src/app/api/profiles/optimize/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { executeStructuredAgent } from "@/lib/agents/claude";

const optimizeSchema = z.object({
  userId: z.string().min(1),
  portal: z.enum(["linkedin", "bumeran"]),
});

const optimizedProfileSchema = z.object({
  headline: z.string(),
  summary: z.string(),
});

const PORTAL_PROMPTS: Record<"linkedin" | "bumeran", string> = {
  linkedin: `Sos un experto en optimizacion de perfiles de LinkedIn. A partir del texto libre que te pasa el usuario describiendo su experiencia, skills y objetivo laboral, genera un perfil optimizado para LinkedIn.

Reglas:
- "headline": corto (menos de 220 caracteres), con las keywords de rol y seniority mas relevantes, estilo profesional de networking.
- "summary": en primera persona, orientado a reclutadores y conexiones, resaltando logros y objetivo laboral.

Responde UNICAMENTE con un objeto JSON valido de la forma {"headline": "...", "summary": "..."}. No agregues texto antes ni despues del JSON, ni uses markdown.`,
  bumeran: `Sos un experto en redaccion de CVs para el mercado laboral latinoamericano (portal Bumeran). A partir del texto libre que te pasa el usuario describiendo su experiencia, skills y objetivo laboral, genera un perfil optimizado para Bumeran.

Reglas:
- "headline": el titulo del puesto que el usuario busca, directo y claro.
- "summary": estilo CV, orientado a logros y experiencia concreta, sin adornos de networking.

Responde UNICAMENTE con un objeto JSON valido de la forma {"headline": "...", "summary": "..."}. No agregues texto antes ni despues del JSON, ni uses markdown.`,
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  }

  const parsed = optimizeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "userId o portal invalido" }, { status: 400 });
  }
  const { userId, portal } = parsed.data;

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    if (!user.rawProfile) {
      return NextResponse.json(
        { error: "Guarda tu perfil base primero" },
        { status: 400 }
      );
    }

    const optimized = await executeStructuredAgent({
      agentInstructions: PORTAL_PROMPTS[portal],
      userQuery: user.rawProfile,
      schema: optimizedProfileSchema,
    });

    const profile = await prisma.userProfile.upsert({
      where: { userId_portal: { userId, portal } },
      update: { headline: optimized.headline, summary: optimized.summary },
      create: {
        userId,
        portal,
        headline: optimized.headline,
        summary: optimized.summary,
      },
    });

    return NextResponse.json(profile, { status: 200 });
  } catch (error) {
    console.error("[POST /api/profiles/optimize error]", error);
    return NextResponse.json({ error: "No se pudo optimizar el perfil" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/api/profiles/optimize/route.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/profiles/optimize/route.ts src/app/api/profiles/optimize/route.test.ts
git commit -m "feat: add POST /api/profiles/optimize endpoint"
```

---

### Task 6: `/profile` page, nav links, and README

**Files:**
- Create: `src/app/profile/page.tsx`
- Modify: `src/components/sections/AuthGate.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: `getStoredUser` from `@/lib/auth-storage` (existing); `GET /api/profiles`, `PUT /api/profiles/base`, `POST /api/profiles/optimize` (Tasks 3–5's exact response shapes).
- Produces: nothing consumed by later tasks (this is the final task).

- [ ] **Step 1: Add nav links to `AuthGate`**

In `src/components/sections/AuthGate.tsx`, replace the header bar's returned JSX (the block starting at `return (` after the `user === null` branch) with:

```tsx
  return (
    <>
      <div className="flex items-center justify-between border-b border-dark-700 bg-dark-900 px-6 py-3 text-sm text-dark-300">
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
        </nav>
        <div className="flex items-center gap-4">
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
      </div>
      {children}
    </>
  );
```

- [ ] **Step 2: Create the `/profile` page**

Create `src/app/profile/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { getStoredUser } from "@/lib/auth-storage";

type Portal = "linkedin" | "bumeran";

interface PortalProfile {
  id: string;
  portal: string;
  headline: string | null;
  summary: string | null;
}

const PORTAL_LABELS: Record<Portal, string> = {
  linkedin: "LinkedIn",
  bumeran: "Bumeran",
};

export default function ProfilePage() {
  const [rawProfile, setRawProfile] = useState("");
  const [baseSaved, setBaseSaved] = useState(false);
  const [profiles, setProfiles] = useState<PortalProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const [portal, setPortal] = useState<Portal>("linkedin");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState("");

  useEffect(() => {
    const user = getStoredUser();
    if (!user) return;

    fetch(`/api/profiles?userId=${user.id}`)
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data: { rawProfile: string | null; profiles: PortalProfile[] }) => {
        setRawProfile(data.rawProfile ?? "");
        setBaseSaved(Boolean(data.rawProfile));
        setProfiles(data.profiles);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSaveBase(e: React.FormEvent) {
    e.preventDefault();
    setSaveError("");
    const user = getStoredUser();
    if (!user) return;

    setSaving(true);
    try {
      const response = await fetch("/api/profiles/base", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, rawProfile }),
      });
      if (!response.ok) throw new Error("failed");
      setBaseSaved(true);
    } catch {
      setSaveError("No se pudo guardar el perfil. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  async function handleOptimize() {
    setOptimizeError("");
    const user = getStoredUser();
    if (!user) return;

    setOptimizing(true);
    try {
      const response = await fetch("/api/profiles/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, portal }),
      });
      if (!response.ok) throw new Error("failed");
      const updated: PortalProfile = await response.json();
      setProfiles((current) => [
        updated,
        ...current.filter((p) => p.portal !== updated.portal),
      ]);
    } catch {
      setOptimizeError("No se pudo optimizar el perfil. Intenta de nuevo.");
    } finally {
      setOptimizing(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-dark-950 text-white">
        Cargando...
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 bg-dark-950 px-4 py-16 text-white">
      <h1 className="text-3xl font-bold">Tu perfil</h1>

      <form onSubmit={handleSaveBase} className="flex w-full max-w-md flex-col gap-4">
        <label className="text-sm text-dark-300">
          Contame tu experiencia, skills y objetivo laboral
        </label>
        <textarea
          value={rawProfile}
          onChange={(e) => setRawProfile(e.target.value)}
          rows={8}
          className="rounded-lg bg-dark-800 p-3 text-white"
        />
        {saveError && <p className="text-sm text-magenta-400">{saveError}</p>}
        <button
          type="submit"
          disabled={saving || rawProfile.trim() === ""}
          className="w-full rounded-lg bg-cyan-400 py-2 font-semibold text-dark-950 transition-colors hover:bg-cyan-300 disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar perfil"}
        </button>
      </form>

      <div className="flex w-full max-w-md flex-col gap-4">
        <div className="flex gap-4">
          <select
            value={portal}
            onChange={(e) => setPortal(e.target.value as Portal)}
            className="rounded-lg bg-dark-800 px-3 py-2 text-white"
          >
            <option value="linkedin">LinkedIn</option>
            <option value="bumeran">Bumeran</option>
          </select>
          <button
            onClick={handleOptimize}
            disabled={optimizing || !baseSaved}
            className="flex-1 rounded-lg bg-cyan-400 py-2 font-semibold text-dark-950 transition-colors hover:bg-cyan-300 disabled:opacity-50"
          >
            {optimizing ? "Optimizando..." : "Optimizar"}
          </button>
        </div>
        {!baseSaved && (
          <p className="text-sm text-dark-400">
            Guarda tu perfil base primero para poder optimizarlo.
          </p>
        )}
        {optimizeError && <p className="text-sm text-magenta-400">{optimizeError}</p>}
      </div>

      {profiles.length > 0 && (
        <div className="flex w-full max-w-md flex-col gap-4">
          {profiles.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-dark-700 bg-dark-900 p-4 text-dark-200"
            >
              <h2 className="mb-2 font-semibold text-cyan-400">
                {PORTAL_LABELS[p.portal as Portal] ?? p.portal}
              </h2>
              <p className="mb-1 font-medium">{p.headline}</p>
              <p className="text-sm">{p.summary}</p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Update the README**

In `README.md`, check the roadmap item and add a documentation section. Change:

```markdown
- [ ] Agente de IA: optimizacion de CV/perfil por portal
```

to:

```markdown
- [x] Agente de IA: optimizacion de CV/perfil por portal
```

And add a new section after `## Dashboard` (before `## Tests`):

```markdown
## Perfil optimizado por IA

En `/profile` (requiere estar autenticado) el usuario escribe un texto libre
describiendo su experiencia, skills y objetivo laboral (su "perfil base") y
lo guarda con `PUT /api/profiles/base`. Eligiendo un portal (LinkedIn o
Bumeran) y apretando "Optimizar" (`POST /api/profiles/optimize`), un agente
de Claude genera un `headline` y `summary` adaptados a ese portal a partir
del perfil base, y el resultado se guarda automaticamente como el
`UserProfile` de ese `(usuario, portal)` — cada optimizacion sobrescribe la
anterior, no hay historial ni edicion manual del resultado. Requiere la
variable de entorno `ANTHROPIC_API_KEY`.
```

Also update the `## Estructura del Proyecto` tree. Change:

```
      profiles/
      applications/
    dashboard/
    upload/
    page.tsx
```

to:

```
      profiles/
        base/
        optimize/
      applications/
    dashboard/
    profile/
    upload/
    page.tsx
```

- [ ] **Step 4: Run the full test suite**

Run: `npm run test`
Expected: all tests PASS, including the new `claude.test.ts` and the three new `route.test.ts` files.

- [ ] **Step 5: Run lint and typecheck**

Run:
```bash
npm run lint
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/profile/page.tsx src/components/sections/AuthGate.tsx README.md
git commit -m "feat: add /profile page with base-profile form, portal optimize, and nav links"
```

---

### Task 7: Deploy setup — `ANTHROPIC_API_KEY` on Vercel

This task requires an actual secret value the user must supply interactively — it is not delegated to a subagent. Run these at the end, alongside the final merge + deploy step (per the project's usual finishing workflow).

- [ ] **Step 1: Confirm Vercel CLI is installed and linked**

```bash
vercel --version
vercel link
```

If the CLI isn't installed: `npm i -g vercel`, then `vercel login` before `vercel link` (select `jms-projects-d184fb54/agent-job`).

- [ ] **Step 2: Add the key for Preview and Production**

```bash
vercel env add ANTHROPIC_API_KEY preview
vercel env add ANTHROPIC_API_KEY production
```

Paste the real Anthropic API key when prompted for each.

- [ ] **Step 3: Verify**

```bash
vercel env ls
```

Expected: `ANTHROPIC_API_KEY` listed for both `Preview` and `Production`.
