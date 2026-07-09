# Dashboard — Design Spec

## Purpose

Give the authenticated user a place to see the `SavedJob` rows created via Excel upload and update each one's status (`saved` / `applied` / `discarded`) — the first read+write UI beyond the upload flow.

## Context

- `SavedJob` (from the Day 1 schema) has `title`, `company`, `portal`, `salary?`, `link`, `status` (default `"saved"`), scoped to `userId`.
- The Excel-upload feature is the only thing creating `SavedJob` rows today; there's no other source of data yet.
- `src/app/dashboard/` currently contains only a `.gitkeep` placeholder from the Day 1 scaffold.
- Established MVP security model (from the auth and Excel-upload features): the client sends `userId` directly, the server trusts it without re-verification, but endpoints still scope reads/writes to the given `userId` so one user can't see or edit another's data.

## Decisions (from brainstorming)

1. **Scope: list + inline status change.** A table of the user's `SavedJob` rows, with a status dropdown per row that updates immediately. No filters, no sorting controls, no pagination — ordered by `createdAt` descending, simplest possible MVP.
2. **No filters/sorting for now.** Can be added later if row volume makes the plain list unwieldy.
3. **Status values:** `saved`, `applied`, `discarded` (matches the values already implied by `SavedJob.status`'s Day-1 schema comment).

## Components

### `src/lib/job-status.ts` (new)

```ts
export const JOB_STATUSES = ["saved", "applied", "discarded"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
```

Shared between the PATCH route's validation and the dashboard page's `<select>` options — one source of truth for the allowed values.

### `GET /api/jobs` (new, `src/app/api/jobs/route.ts`)

- Reads `userId` from the query string (`?userId=...`).
- `400` if `userId` is missing.
- Returns `200 { jobs: SavedJob[] }`, scoped to that `userId`, ordered by `createdAt` descending.

### `PATCH /api/jobs/[id]` (new, `src/app/api/jobs/[id]/route.ts`)

- Body: `{ userId: string, status: string }`.
- `400` if `userId` is missing or `status` isn't one of `JOB_STATUSES`.
- Looks up the `SavedJob` by the route's `id`. If it doesn't exist, or its `userId` doesn't match the body's `userId`, returns `404` (not `403` — avoids confirming to a client whether a given id exists at all, consistent with not leaking cross-user existence).
- On match: updates `status`, returns `200` with the updated row.

### `src/app/dashboard/page.tsx` (new content, replacing the `.gitkeep`)

- On mount, reads the current user via `getStoredUser()` (already exists), calls `GET /api/jobs?userId=<id>`.
- Renders a table: Titulo, Empresa, Portal, Estado (a `<select>` with the three `JOB_STATUSES` options, current value pre-selected), Link (as a clickable anchor).
- Changing the `<select>` calls `PATCH /api/jobs/[id]` with the new status; on success, updates that row's status in local component state (no full refetch needed); on failure, reverts the dropdown and shows an inline error for that row.
- Empty state: if the user has no `SavedJob` rows, show a short message (e.g., pointing them to `/upload`) instead of an empty table.

## Data flow

1. User visits `/dashboard` (already authenticated — the whole app is gated).
2. Page calls `GET /api/jobs?userId=<id>`, renders the table (or the empty-state message).
3. User changes a row's status dropdown → `PATCH /api/jobs/[id]` with `{userId, status}` → row updates in place on success, reverts with an error on failure.

## Error handling

- `GET`: missing `userId` → `400`. Unexpected DB error → `500`.
- `PATCH`: missing `userId` or invalid `status` value → `400` (checked before any DB call). Job not found or owned by a different user → `404`. Unexpected DB error → `500`.
- Client-side: a failed `GET` shows a page-level error message with no table. A failed `PATCH` reverts just that row's dropdown and shows a small inline error, without disturbing the rest of the table.

## Testing approach

- `src/app/api/jobs/route.test.ts`: live-DB integration test (same pattern as auth/upload) — creates a test user and a few `SavedJob` rows scoped to it in `beforeAll`, asserts `GET` returns exactly those rows in the right order, asserts a `userId` for a different/nonexistent user returns an empty list (not another user's rows), cleans up in `afterAll`.
- `src/app/api/jobs/[id]/route.test.ts`: live-DB integration test — creates a test user + one `SavedJob` row, asserts a valid status update persists and is returned, asserts an invalid status value is rejected with `400` before any DB write, asserts updating a job that belongs to a different test user returns `404` and leaves the row unchanged, cleans up in `afterAll`.
- No automated test for `dashboard/page.tsx` (React component with fetch) — verified via `npm run build` and a manual/browser end-to-end check, consistent with how `EmailGateModal`/`AuthGate`/`/upload` were verified.

## Out of scope

- Filtering, sorting, searching, or pagination.
- Editing any field other than `status` (title/company/portal/salary/link stay read-only from the dashboard).
- Deleting `SavedJob` rows.
- Any UI for `UserProfile`, `Application`, or `PortalSync` — those belong to future features (CV-optimization agent, portal sync).
- "Proximas acciones" (next actions) beyond the status change itself — the original roadmap phrase is satisfied by letting the user mark progress via status, not by a separate recommendations feature.

## Acceptance criteria

- `npm run lint`, `npm run test`, and `npm run build` pass.
- `GET /api/jobs?userId=X` returns only `X`'s `SavedJob` rows, newest first.
- `PATCH /api/jobs/[id]` updates the status when the job belongs to the given user, and returns `404` without modifying anything when it doesn't (or doesn't exist).
- The dashboard page renders the table for a user with rows, and a helpful empty-state message for a user with none.
- Changing a row's status in the browser persists (confirmed via a follow-up `GET` or page refresh) and reverts visually on a failed request.
- No test-created rows (`User` or `SavedJob`) are left behind in the live database after the test suite runs.
