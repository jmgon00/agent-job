# Day 1 Scaffold — agent-job

## Purpose

Bootstrap the `agent-job` repo (job-search automation platform) as an empty-but-runnable Next.js 16 project, following the same stack, folder conventions, and tooling as the sibling project **AgenticSec** (`E:\Cloude projects\interactiv3Web`). This spec covers only the Day 1 scaffold: no product features (Excel upload, CV optimization agent, portal sync, dashboard, scraper) are implemented yet. Each of those becomes its own future spec.

## Context

- GitHub repo `github.com/jmgon00/agent-job` already exists; local repo at `E:\Cloude projects\agent-job` already has `origin` configured, no commits yet.
- An accidental nested duplicate git repo (`agent-job/agent-job`) was found and removed before this spec was written.
- AgenticSec uses: Next.js 16.2.10, React 19.2.4, Tailwind CSS 4, Prisma 6.19.3 + PostgreSQL (Neon), `@anthropic-ai/sdk` ^0.110.0, TypeScript 5, ESLint 9. Email + localStorage auth pattern (no session/JWT).

## Approach

Copy AgenticSec's config skeleton (`package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.gitignore`) into `agent-job`, adjusting names/content as needed, rather than running `create-next-app` fresh. This guarantees identical dependency versions and tooling behavior across both sibling projects with less reconciliation work.

## Folder structure

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
      claude.ts       (Anthropic SDK wrapper, copied pattern from AgenticSec)
      handlers.ts      (stub)
      types.ts         (stub)
    db.ts
    validators.ts
  content/
  types/
prisma/
  schema.prisma
  seed.ts
public/
docs/
```

Only stub/placeholder files are created where no logic exists yet (e.g. `src/app/page.tsx` is a minimal placeholder home page; `src/app/api/*` route folders are empty until a feature spec fills them in).

## Package & config

- `package.json` name: `agent-job`.
- Scripts mirror AgenticSec: `dev`, `build` (`prisma generate && next build`), `start`, `lint`, `seed` (`prisma db seed`).
- `postinstall` runs `prisma generate` only (no `prisma db push`) since no real `DATABASE_URL` exists yet — running `db push` would fail without a live DB connection.
- Dependencies pinned to the same versions as AgenticSec: `next@16.2.10`, `react@19.2.4`, `react-dom@19.2.4`, `@anthropic-ai/sdk@^0.110.0`, `zod@^4.4.3`, `axios@^1.18.1`, `clsx@^2.1.1`; devDependencies: `@prisma/client@^6.19.3`, `prisma@^6.19.3`, `tailwindcss@^4`, `@tailwindcss/postcss@^4`, `typescript@^5`, `eslint@^9`, `eslint-config-next@16.2.10`, `ts-node@^10.9.2`, plus `@types/*`.
- `tailwind.config.ts` copied verbatim from AgenticSec: cyan/magenta color palette, glow box-shadows, gradient/float/fadeInUp animations. Reused as-is per user preference (visual consistency across sibling projects).
- `.env.example` with placeholder values: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SITE_URL`. No real credentials committed.
- Auth (email + localStorage, matching AgenticSec's pattern) is **stack intent only** — not implemented in this scaffold. It will be built alongside the dashboard/login feature spec.

## Database schema (skeleton, subject to refinement per-feature)

`prisma/schema.prisma`, provider `postgresql`, `env("DATABASE_URL")`:

- **User**: `id, email (unique), name?, linkedinToken?, bumeranToken?, createdAt, updatedAt` — relations to `UserProfile`, `SavedJob`, `Application`, `PortalSync`.
- **UserProfile**: `id, userId, portal, headline?, summary?, resumeData? (Json), createdAt, updatedAt` — one portal-specific CV/profile variant per row.
- **SavedJob**: `id, userId, title, company, portal, salary?, link, status (default "saved"), createdAt, updatedAt` — relation to `Application`.
- **Application**: `id, userId, savedJobId, status (default "pending"), appliedAt?, notes?, createdAt, updatedAt`.
- **PortalSync**: `id, userId, portal, status (default "disconnected"), lastSyncAt?, errorMessage?, createdAt, updatedAt` — tracks LinkedIn/Bumeran connection state.

All models follow AgenticSec conventions: `cuid()` ids, `@@index` on lookup fields (`userId`, `portal`, `status`, etc.), `onDelete: Cascade` on foreign keys.

**No migration is run in this scaffold.** `prisma generate` (client generation, no DB connection needed) is verified; `prisma migrate dev` / `db push` are left for the user to run once a real Neon `DATABASE_URL` is available.

## README

Spanish-language, mirroring AgenticSec's structure:
- Project description (job-search automation platform)
- Stack table (Next.js 16, TypeScript 5, Tailwind 4, Prisma 6 + Neon Postgres, Claude 3.5 Sonnet API)
- Setup steps: clone → `npm install` → copy `.env.example` → `npx prisma generate` → `npm run dev`
- Project structure tree
- MVP roadmap section listing the 5 planned features (Excel upload, AI CV/profile optimizer per portal, portal API connections, dashboard, job scraper) marked as **upcoming**, each to get its own spec later

## Acceptance criteria ("Day 1 done")

- `npm install` completes without errors
- `npm run lint` passes
- `npm run build` passes (placeholder home page only, no real routes)
- `npx prisma generate` succeeds against the schema (no live DB connection required)
- Git: first commit message `init: scaffold agent-job base`, committed and pushed to `origin/main`

## Out of scope (future specs)

- Excel upload & parsing flow
- AI agent: CV/profile optimization per portal
- LinkedIn / Bumeran API connections and OAuth
- Dashboard UI (profile status, next actions)
- Job scraper
- Actual auth implementation (email + localStorage session handling)
- Running real Prisma migrations against Neon
