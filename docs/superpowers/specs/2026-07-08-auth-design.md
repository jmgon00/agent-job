# Auth (Email + localStorage) — Design Spec

## Purpose

Give agent-job a minimal identity layer so that SavedJob, UserProfile, Application, and PortalSync records can be scoped to a real `User` row, following the same zero-friction "email + localStorage" pattern AgenticSec uses (no password, no session tokens, no email verification — this is an MVP identity mechanism, not production auth).

## Context

- AgenticSec's pattern (`E:\Cloude projects\interactiv3Web\src\app\agents\page.tsx`, `src\components\sections\EmailModal.tsx`): a modal asks for an email, validates format client-side with `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, stores it in `localStorage` under a fixed key, and every subsequent request tags data with that raw email string. AgenticSec has no `User` table — `AgentSession.userEmail` is just a string, and the modal can be dismissed ("continue without email").
- agent-job already has a `User` model (`prisma/schema.prisma`) with `id`, `email @unique`, and relations to `UserProfile`, `SavedJob`, `Application`, `PortalSync`. Every other planned feature hangs off `User.id`, so — unlike AgenticSec — anonymous use doesn't make sense here, and the app needs an actual `User` row, not just a string.
- Current app state: `src/app/layout.tsx` is a server component rendering a static placeholder `page.tsx`. `src/lib/validators.ts` and `src/lib/agents/{handlers,types}.ts` exist as intentionally empty stub files (see `docs/superpowers/plans/2026-07-08-day1-scaffold.md`, Task 4) — this feature is the first to give `validators.ts` real content.

## Decisions (from brainstorming)

1. **Email is mandatory, no anonymous mode.** Unlike AgenticSec's dismissible modal, agent-job blocks all content until an email is captured.
2. **Gate lives in the root layout**, not on a specific route — the whole app is behind it from Day 1.
3. **Logout is included**: a visible control clears localStorage and re-shows the modal (useful for testing with multiple users in development).
4. **Single "identify" endpoint** (`POST /api/auth`) does a find-or-create (`upsert`) on `User` by email, once, and returns `{ id, email }`. The client caches both `userId` and `email` in localStorage. All other future API routes (jobs, profiles, applications) will accept an already-resolved `userId` from the client and trust it directly — no re-verification, matching the deliberately minimal security model of this MVP phase.

## Components

### `src/lib/validators.ts` (currently empty — first real content)

```ts
import { z } from "zod";

export const emailSchema = z.object({
  email: z.string().email("Email invalido"),
});

export type EmailInput = z.infer<typeof emailSchema>;
```

### `src/app/api/auth/route.ts` (new)

`POST` handler:
- Parses the request body with `emailSchema`.
- On validation failure: `400` with `{ error: "Email invalido" }`.
- On success: `prisma.user.upsert({ where: { email }, update: {}, create: { email } })`, returns `200` with `{ id, email }`.
- On unexpected DB error: `500` with `{ error: "Error interno" }`.

### `src/lib/auth-storage.ts` (new)

Client-side localStorage helpers, keys `agentjob_user_id` and `agentjob_user_email`:

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

### `src/components/sections/EmailGateModal.tsx` (new, `"use client"`)

Same visual/validation pattern as AgenticSec's `EmailModal.tsx` (dark modal, email input, client-side regex/zod check, error message on invalid format), reusing the app's cyan/magenta theme. Differences from AgenticSec:
- No "continue without email" dismiss button.
- On submit: calls `POST /api/auth`, shows a loading state while the request is in flight, shows a form-level error if the request fails (network or 4xx/5xx), and only calls `onSuccess({ id, email })` once the API confirms success.

Props: `{ onSuccess: (user: StoredUser) => void }`.

### `src/components/sections/AuthGate.tsx` (new, `"use client"`)

Wraps `children`:
- On mount, reads `getStoredUser()`.
- No stored user → renders only `<EmailGateModal onSuccess={...} />` (nothing else — the app's content does not render until identified).
- Stored user present → renders a minimal top bar showing the email and a "Cerrar sesion" button (calls `clearStoredUser()` then resets state to show the modal again), followed by `children`.
- To avoid a hydration flash, the very first client render (before the `useEffect` mount check resolves) renders nothing (`null`) rather than assuming either state.

### `src/app/layout.tsx` (modified)

Wraps `{children}` with `<AuthGate>{children}</AuthGate>`. `layout.tsx` itself stays a server component; `AuthGate` is the client boundary.

## Data flow

1. User loads any page → `AuthGate` mounts, checks localStorage.
2. No stored user → `EmailGateModal` renders (only element on screen) → user submits email → `POST /api/auth` → upsert → `{id, email}` returned → `setStoredUser()` → `AuthGate` re-renders with `children` visible.
3. Stored user found on mount → `children` render immediately, no API call.
4. Logout → `clearStoredUser()` → `AuthGate` state resets → back to step 2.

## Error handling

- Invalid email format: caught client-side before any request (zod, mirrored from the same regex-equivalent AgenticSec used) and again server-side (defense in depth, since the API could be called directly).
- API/network failure on submit: modal shows an inline error ("No se pudo conectar. Intenta de nuevo.") and stays open; localStorage is not written until a 200 response with a valid `{id, email}` body is received.
- No retries/backoff logic — this is a manual retry via the same submit button, consistent with the MVP scope of this feature.

## Out of scope

- Password/session tokens, email verification, magic links.
- Server-side session/cookie-based auth — identity is purely a client-trusted `userId` in localStorage, matching the deliberately minimal security model already established for this MVP phase.
- Rate limiting on `POST /api/auth` (AgenticSec has a `rate-limit.ts` utility for its contact forms; not reused here — can be revisited if abuse becomes a concern).
- Any UI beyond the modal and the minimal logout bar (no full account/profile settings page).

## Acceptance criteria

- `npm run lint` and `npm run build` pass.
- Visiting any route with no stored user shows only the email modal, no app content behind it.
- Submitting a valid, new email creates a `User` row in the database and unblocks the app.
- Submitting the same email again (e.g., after logout, or in a second browser) resolves to the same `User` row (upsert, not duplicate creation) — enforced by `User.email`'s existing `@unique` constraint.
- Logout clears localStorage and re-shows the modal on the next render.
