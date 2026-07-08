# Day 1 Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap `agent-job` into a runnable, lint/build-clean Next.js 16 project with the same stack, folder conventions, and Tailwind theme as the sibling project AgenticSec, with a Prisma schema skeleton for the core domain models — no product features implemented yet.

**Architecture:** Copy AgenticSec's tooling config (package.json, tsconfig, next/eslint/postcss configs) verbatim and adapt names; add a minimal App Router shell (`layout.tsx`/`page.tsx`/`globals.css`) reusing the cyan/magenta Tailwind v4 theme; add a 5-model Prisma schema (User, UserProfile, SavedJob, Application, PortalSync); scaffold empty folder stubs for future features (api routes, dashboard, components, lib/agents).

**Tech Stack:** Next.js 16.2.10, React 19.2.4, TypeScript 5, Tailwind CSS 4, Prisma 6.19.3 + PostgreSQL (Neon), `@anthropic-ai/sdk` ^0.110.0, Zod 4, ESLint 9.

## Global Constraints

- Dependency versions must match AgenticSec exactly: `next@16.2.10`, `react@19.2.4`, `react-dom@19.2.4`, `@prisma/client@^6.19.3`, `prisma@^6.19.3`, `tailwindcss@^4`, `eslint-config-next@16.2.10`, `typescript@^5`.
- Tailwind v4 is CSS-first: theme tokens (colors, shadows, animations) must live in `src/app/globals.css` under `@theme`, not only in `tailwind.config.ts` — `tailwind.config.ts` alone will not generate the custom utility classes.
- No real `DATABASE_URL` exists yet. `npx prisma generate` must succeed without a live DB connection. `prisma migrate dev` / `db push` are explicitly out of scope for this plan.
- Package name is `agent-job` (not `agenticsec`).
- Repo root is `E:\Cloude projects\agent-job`. Remote `origin` is already `github.com/jmgon00/agent-job`. A prior commit (`aed8a62`, the design spec) already exists on `main`.
- Every task's commit message must follow Conventional Commits style, ending with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Package manifest & tooling config

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `eslint.config.mjs`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `prisma.config.ts`

**Interfaces:**
- Produces: `package.json` scripts (`dev`, `build`, `start`, `lint`, `seed`, `postinstall`) that every later task's verify commands rely on. `tsconfig.json` path alias `@/*` → `./src/*` used by all later imports.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "agent-job",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "lint": "eslint",
    "seed": "prisma db seed",
    "postinstall": "prisma generate"
  },
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.110.0",
    "axios": "^1.18.1",
    "clsx": "^2.1.1",
    "next": "16.2.10",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@prisma/client": "^6.19.3",
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "dotenv": "^16.6.1",
    "eslint": "^9",
    "eslint-config-next": "16.2.10",
    "prisma": "^6.19.3",
    "tailwindcss": "^4",
    "ts-node": "^10.9.2",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "paths": {
      "@/*": ["./src/*"]
    },
    "plugins": [
      {
        "name": "next"
      }
    ]
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [ ] **Step 4: Create `postcss.config.mjs`**

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

- [ ] **Step 5: Create `eslint.config.mjs`**

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
```

- [ ] **Step 6: Create `.gitignore`**

```
# dependencies
/node_modules
/.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files (can opt-in for committing if needed)
.env*
!.env.example

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts

/src/generated/prisma
```

- [ ] **Step 7: Create `.env.example`**

```
# Base de datos (PostgreSQL via Neon)
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"

# Claude API (agente de optimizacion de CV/perfil)
ANTHROPIC_API_KEY="sk-ant-your-key-here"

# Site
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```

- [ ] **Step 8: Create `prisma.config.ts`**

```ts
import { config } from "dotenv";
import { defineConfig } from "prisma/config";
import path from "path";

const envPath = path.join(process.cwd(), ".env.local");
const result = config({ path: envPath });

if (result.error) {
  config({ path: ".env" });
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"] || "",
  },
});
```

- [ ] **Step 9: Create local-only `.env.local` (not committed) with a placeholder DB URL**

This file is gitignored (matches `.env*` pattern in `.gitignore`) but is needed locally so `prisma generate` in later tasks has a `DATABASE_URL` to read (generate does not need a *live* connection, just a defined env var).

```
DATABASE_URL="postgresql://user:password@localhost:5432/agentjob"
ANTHROPIC_API_KEY=""
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```

- [ ] **Step 10: Install dependencies**

Run: `npm install`
Expected: exits 0, creates `node_modules/`, `package-lock.json`. `postinstall` runs `prisma generate` — this will fail at this point because `prisma/schema.prisma` does not exist yet, which is expected; ignore that specific failure for now (it's fixed by Task 3). If `npm install` itself reports failure only because of the `postinstall` script, re-run with `npm install --ignore-scripts` instead, and note in the task output that `postinstall` will be validated for real in Task 3.

- [ ] **Step 11: Verify install**

Run: `Test-Path node_modules/.bin/next` (PowerShell) or `ls node_modules/.bin/next` (bash)
Expected: path exists (`True` / file listed)

- [ ] **Step 12: Commit**

```bash
git add package.json tsconfig.json next.config.ts postcss.config.mjs eslint.config.mjs .gitignore .env.example prisma.config.ts package-lock.json
git commit -m "$(cat <<'EOF'
init: scaffold agent-job base

Copy AgenticSec's tooling config (Next.js 16, TypeScript, Tailwind 4, ESLint, Prisma) as the foundation for agent-job.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Tailwind theme + minimal app shell

**Files:**
- Create: `tailwind.config.ts`
- Create: `src/app/globals.css`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`

**Interfaces:**
- Consumes: `@/*` path alias from Task 1's `tsconfig.json`.
- Produces: `RootLayout` component and `Home` page that `next build` renders; `globals.css` `@theme` tokens (`--color-cyan-400`, `--color-magenta-400`, `--shadow-glow-cyan`, `--animate-float`, etc.) that any future component can reference via Tailwind utility classes (`bg-cyan-400`, `shadow-glow-cyan`, `animate-float`).

- [ ] **Step 1: Create `tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        cyan: {
          50: "#f0f9ff",
          100: "#e0f8ff",
          400: "#00D9FF",
          500: "#00C2E0",
          600: "#00B8CC",
        },
        magenta: {
          400: "#FF006E",
          500: "#FF0066",
          600: "#E60060",
        },
        accent: "#00F5FF",
        primary: "#00D9FF",
        dark: {
          50: "#f9fafb",
          100: "#f3f4f6",
          200: "#e5e7eb",
          300: "#d1d5db",
          400: "#9ca3af",
          500: "#6b7280",
          600: "#4b5563",
          700: "#374151",
          800: "#1f2937",
          900: "#111827",
          950: "#030712",
          base: "#0a0e27",
        },
      },
      backgroundColor: {
        glass: "rgba(17, 24, 39, 0.5)",
        "glass-xl": "rgba(17, 24, 39, 0.5)",
      },
      backdropBlur: {
        lg: "8px",
        xl: "12px",
      },
      boxShadow: {
        "glow-cyan": "0 0 20px rgba(0, 217, 255, 0.4), inset 0 0 20px rgba(0, 217, 255, 0.1)",
        "glow-magenta": "0 0 20px rgba(255, 0, 110, 0.4), inset 0 0 20px rgba(255, 0, 110, 0.1)",
        "cyan-lg": "0 0 30px rgba(0, 217, 255, 0.3)",
      },
      keyframes: {
        gradientFlow: {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-20px)" },
        },
        fadeInUp: {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        textGradient: {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
      },
      animation: {
        gradientFlow: "gradientFlow 3s ease-in-out infinite",
        float: "float 8s ease-in-out infinite",
        fadeInUp: "fadeInUp 0.6s ease-out",
        slideUp: "slideUp 0.6s ease-out",
        textGradient: "textGradient 3s ease-in-out infinite",
      },
      spacing: {
        "safe-top": "env(safe-area-inset-top)",
        "safe-bottom": "env(safe-area-inset-bottom)",
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: Create `src/app/globals.css`**

```css
@import "tailwindcss";

/*
 * Tailwind v4 is CSS-first: tailwind.config.ts is NOT loaded automatically.
 * Custom colors/shadows/animations must be declared here via @theme so the
 * corresponding utility classes (bg-magenta-400, shadow-glow-cyan,
 * animate-float, etc.) actually get generated in production.
 */
@theme {
  --color-cyan-400: #00D9FF;
  --color-cyan-500: #00C2E0;
  --color-cyan-600: #00B8CC;

  --color-magenta-400: #FF006E;
  --color-magenta-500: #FF0066;
  --color-magenta-600: #E60060;

  --color-accent: #00F5FF;

  --color-dark-base: #0a0e27;
  --color-dark-50: #f9fafb;
  --color-dark-100: #f3f4f6;
  --color-dark-200: #e5e7eb;
  --color-dark-300: #d1d5db;
  --color-dark-400: #9ca3af;
  --color-dark-500: #6b7280;
  --color-dark-600: #4b5563;
  --color-dark-700: #374151;
  --color-dark-800: #1f2937;
  --color-dark-900: #111827;
  --color-dark-950: #030712;

  --shadow-glow-cyan: 0 0 20px rgba(0, 217, 255, 0.4), inset 0 0 20px rgba(0, 217, 255, 0.1);
  --shadow-glow-magenta: 0 0 20px rgba(255, 0, 110, 0.4), inset 0 0 20px rgba(255, 0, 110, 0.1);
  --shadow-cyan-lg: 0 0 30px rgba(0, 217, 255, 0.3);

  --animate-gradientFlow: gradientFlow 3s ease-in-out infinite;
  --animate-float: float 8s ease-in-out infinite;
  --animate-fadeInUp: fadeInUp 0.6s ease-out;
  --animate-slideUp: slideUp 0.6s ease-out;
  --animate-textGradient: textGradient 3s ease-in-out infinite;
}

@layer base {
  :root {
    --foreground: #ffffff;
    --background: #0a0e27;
    --primary: #00D9FF;
    --primary-dark: #00B8CC;
    --secondary: #FF006E;
    --secondary-light: #FF4D8D;
    --accent: #00F5FF;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html {
    scroll-behavior: smooth;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto",
      "Helvetica Neue", Arial, sans-serif;
    background-color: var(--background);
    color: var(--foreground);
    line-height: 1.6;
  }

  h1, h2, h3, h4, h5, h6 {
    font-weight: 600;
    line-height: 1.2;
  }

  a {
    text-decoration: none;
    color: var(--primary);
    transition: color 200ms ease-in-out;
  }

  a:hover {
    color: var(--accent);
  }

  button {
    cursor: pointer;
    font-family: inherit;
  }

  :focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
}

@keyframes gradientFlow {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-20px); }
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes textGradient {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
```

- [ ] **Step 3: Create `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Create `src/app/page.tsx`**

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-dark-950 text-white">
      <h1 className="bg-gradient-to-r from-cyan-400 to-magenta-400 bg-clip-text text-4xl font-bold text-transparent">
        agent-job
      </h1>
      <p className="text-dark-300">
        Plataforma de automatizacion de busqueda de empleo — en construccion.
      </p>
    </main>
  );
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: fails at the `prisma generate` step of the `build` script with an error that `prisma/schema.prisma` does not exist (expected — fixed in Task 3). Confirm the failure is specifically about the missing schema file and not about `layout.tsx`/`page.tsx`/`globals.css`/Tailwind. If you want a clean pass at this checkpoint, run `npx next build` directly instead (bypasses the `prisma generate` prestep) and expect exit 0.

- [ ] **Step 6: Commit**

```bash
git add tailwind.config.ts src/app/globals.css src/app/layout.tsx src/app/page.tsx
git commit -m "$(cat <<'EOF'
feat: add tailwind theme and placeholder home page

Reuse AgenticSec's cyan/magenta Tailwind v4 theme (declared in globals.css
via @theme, since Tailwind v4 is CSS-first) and add a minimal home page.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Prisma schema + seed stub

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`

**Interfaces:**
- Produces: Prisma Client types for `User`, `UserProfile`, `SavedJob`, `Application`, `PortalSync` — consumed by Task 4's `src/lib/db.ts`.

- [ ] **Step 1: Create `prisma/schema.prisma`**

```prisma
// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String?
  linkedinToken String?
  bumeranToken  String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  profiles      UserProfile[]
  savedJobs     SavedJob[]
  applications  Application[]
  portalSyncs   PortalSync[]

  @@index([email])
}

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
}

model SavedJob {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  title     String
  company   String
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

model Application {
  id         String    @id @default(cuid())
  userId     String
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  savedJobId String
  savedJob   SavedJob  @relation(fields: [savedJobId], references: [id], onDelete: Cascade)
  status     String    @default("pending")
  appliedAt  DateTime?
  notes      String?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  @@index([userId])
  @@index([savedJobId])
  @@index([status])
}

model PortalSync {
  id           String    @id @default(cuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  portal       String
  status       String    @default("disconnected")
  lastSyncAt   DateTime?
  errorMessage String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@index([userId])
  @@index([portal])
}
```

- [ ] **Step 2: Create `prisma/seed.ts`**

```ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("No hay datos semilla definidos aun para agent-job.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 3: Verify `prisma generate`**

Run: `npx prisma generate`
Expected: `Generated Prisma Client` success message, exit 0. Does not require a live database connection.

- [ ] **Step 4: Verify full build now passes**

Run: `npm run build`
Expected: exit 0, `.next/` build output produced, no errors from Prisma or from the App Router pages.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/seed.ts
git commit -m "$(cat <<'EOF'
feat: add prisma schema for core domain models

Add User, UserProfile, SavedJob, Application, and PortalSync models as a
skeleton for future feature specs (Excel upload, CV optimization agent,
portal sync, dashboard). No migration run yet — no live DATABASE_URL.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: lib/ stubs (Prisma client singleton + Claude agent wrapper)

**Files:**
- Create: `src/lib/db.ts`
- Create: `src/lib/agents/claude.ts`
- Create: `src/lib/agents/handlers.ts` (intentionally empty — see note below)
- Create: `src/lib/agents/types.ts` (intentionally empty — see note below)
- Create: `src/lib/validators.ts` (intentionally empty — see note below)

**Interfaces:**
- Produces: `prisma` singleton exported from `@/lib/db`, consumed by any future API route. `executeAgent({ agentInstructions, userQuery, maxTokens?, temperature? }): Promise<{ response: string; tokensUsed: number }>` exported from `@/lib/agents/claude`, ready for the future CV-optimization-agent feature spec to call.

**Note on empty files:** AgenticSec's `handlers.ts`, `types.ts`, and `validators.ts` are built around its own `Agent`/`AgentSession` Prisma models and contact-form fields, which don't exist in agent-job's schema — copying them verbatim would reference non-existent Prisma models and break the build. These three files are left empty on purpose, to preserve the folder shape agreed in the spec, until the CV-optimization-agent and Excel-upload feature specs define real contents for them.

- [ ] **Step 1: Create `src/lib/db.ts`**

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ["query", "error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 2: Create `src/lib/agents/claude.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export interface ExecuteAgentParams {
  agentInstructions: string
  userQuery: string
  maxTokens?: number
  temperature?: number
}

export interface ExecuteAgentResponse {
  response: string
  tokensUsed: number
}

export async function executeAgent({
  agentInstructions,
  userQuery,
  maxTokens = 1000,
  temperature = 0.7,
}: ExecuteAgentParams): Promise<ExecuteAgentResponse> {
  try {
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

    const textContent = message.content.find((c: any) => c.type === "text")
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from Claude")
    }

    return {
      response: textContent.text,
      tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
    }
  } catch (error) {
    console.error("[executeAgent error]", error)
    throw error
  }
}
```

- [ ] **Step 3: Create empty `src/lib/agents/handlers.ts`, `src/lib/agents/types.ts`, `src/lib/validators.ts`**

Create all three files with zero bytes of content (literally empty files).

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: exit 0. Confirms `db.ts` type-checks against the generated Prisma Client from Task 3, and `claude.ts` compiles against `@anthropic-ai/sdk`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/agents/claude.ts src/lib/agents/handlers.ts src/lib/agents/types.ts src/lib/validators.ts
git commit -m "$(cat <<'EOF'
feat: add prisma client singleton and claude agent wrapper

Add src/lib/db.ts (Prisma client singleton) and src/lib/agents/claude.ts
(generic Anthropic SDK wrapper, reused from AgenticSec). handlers.ts,
types.ts, and validators.ts are left empty until the CV-optimization-agent
and Excel-upload feature specs define their contents.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Empty folder scaffolding for future features

**Files:**
- Create: `src/app/api/jobs/.gitkeep`
- Create: `src/app/api/profiles/.gitkeep`
- Create: `src/app/api/applications/.gitkeep`
- Create: `src/app/dashboard/.gitkeep`
- Create: `src/components/sections/.gitkeep`
- Create: `src/components/ui/.gitkeep`
- Create: `src/content/.gitkeep`
- Create: `src/types/.gitkeep`

**Interfaces:**
- Produces: empty directories tracked by git (via `.gitkeep`) matching the folder structure agreed in the design spec, ready for future feature specs to fill in.

- [ ] **Step 1: Create all eight empty `.gitkeep` files listed above**

Each file is zero bytes. These directories have no code yet — they exist so future feature specs (Excel upload → `src/app/api/jobs`, profile sync → `src/app/api/profiles`, applications tracking → `src/app/api/applications`, dashboard UI → `src/app/dashboard` + `src/components/*`) land in the agreed locations.

- [ ] **Step 2: Verify build is unaffected**

Run: `npm run build`
Expected: exit 0, identical to Task 4's result (empty directories with no `.tsx`/`.ts` route files don't add any routes or components).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/jobs/.gitkeep src/app/api/profiles/.gitkeep src/app/api/applications/.gitkeep src/app/dashboard/.gitkeep src/components/sections/.gitkeep src/components/ui/.gitkeep src/content/.gitkeep src/types/.gitkeep
git commit -m "$(cat <<'EOF'
chore: scaffold folder structure for future features

Add empty directories (tracked via .gitkeep) for api routes, dashboard,
components, and content, matching the structure agreed in the Day 1 spec.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```markdown
# agent-job

Plataforma de automatizacion de busqueda de empleo: sube tu CV/Excel de postulaciones,
un agente de IA optimiza tu perfil por portal, sincroniza el estado de tus postulaciones
en LinkedIn y Bumeran, y seguis todo desde un dashboard.

## Stack Tecnologico

- **Framework:** Next.js 16.2.10 (App Router)
- **Lenguaje:** TypeScript 5
- **Estilos:** Tailwind CSS 4
- **Base de Datos:** Prisma 6 + PostgreSQL (Neon)
- **IA:** Claude 3.5 Sonnet (`@anthropic-ai/sdk`)
- **Validacion:** Zod 4
- **Runtime:** Node.js 18+

## Instalacion

### 1. Clonar el repositorio

```bash
git clone https://github.com/jmgon00/agent-job.git
cd agent-job
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env.local
```

Edita `.env.local` con tu `DATABASE_URL` de Neon y tu `ANTHROPIC_API_KEY`.

### 4. Generar el cliente Prisma

```bash
npx prisma generate
```

### 5. Aplicar el schema a tu base de datos Neon

```bash
npx prisma db push
```

### 6. Iniciar el servidor de desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Estructura del Proyecto

```
src/
  app/
    api/
      jobs/
      profiles/
      applications/
    dashboard/
    page.tsx
  components/
    sections/
    ui/
  lib/
    agents/
    db.ts
    validators.ts
  content/
  types/
prisma/
  schema.prisma
  seed.ts
```

## Roadmap MVP

- [ ] Upload de Excel con postulaciones/perfiles
- [ ] Agente de IA: optimizacion de CV/perfil por portal
- [ ] Conexion a APIs de LinkedIn / Bumeran
- [ ] Dashboard: estado de perfiles + proximas acciones
- [ ] Job scraper

Cada item de este roadmap se disena e implementa como su propio spec.
```

- [ ] **Step 2: Verify README has no unresolved placeholders**

Run: `Select-String -Path README.md -Pattern "TBD|TODO|lorem ipsum"` (PowerShell) or `grep -inE "TBD|TODO|lorem ipsum" README.md` (bash)
Expected: no matches (empty output). (The `[ ]` roadmap checkboxes are intentional unchecked-task markers, not placeholders.)

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: add README with setup instructions and MVP roadmap

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Final verification and push

**Files:** none (verification only)

- [ ] **Step 1: Run full install from clean state**

Run: `npm install`
Expected: exit 0. `postinstall` now succeeds running `prisma generate` (schema exists since Task 3).

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: exit 0, no errors (warnings acceptable).

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: exit 0, `.next/` output produced.

- [ ] **Step 4: Confirm git log shows all scaffold commits on `main`**

Run: `git log --oneline`
Expected: at least 6 commits total — the pre-existing `docs: add Day 1 scaffold design spec` plus this plan's `init: scaffold agent-job base`, `feat: add tailwind theme...`, `feat: add prisma schema...`, `feat: add prisma client singleton...`, `chore: scaffold folder structure...`, `docs: add README...`.

- [ ] **Step 5: Push to origin**

Run: `git push -u origin main`
Expected: exit 0, remote `main` now matches local `main`.

- [ ] **Step 6: Confirm push succeeded**

Run: `git status`
Expected: `Your branch is up to date with 'origin/main'.` and `nothing to commit, working tree clean`.

---

## Spec coverage check

- Approach (copy AgenticSec config) → Task 1
- Folder structure → Tasks 1, 2, 4, 5
- Package & config (versions, scripts, `.env.example`, no `db push` in `postinstall`) → Task 1
- Tailwind theme (reused verbatim, CSS-first `@theme`) → Task 2
- Database schema skeleton (5 models) → Task 3
- Auth (email + localStorage) → explicitly out of scope, not scheduled in any task (per spec's "Out of scope" section)
- README → Task 6
- Acceptance criteria (`npm install`/`lint`/`build`/`prisma generate` pass, first commit message, push to origin) → Tasks 1, 3, 7
