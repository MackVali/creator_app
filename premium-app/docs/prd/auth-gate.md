# PRD: Auth Gate & Shell Separation

## Problem
Unauthenticated users can hit app routes; public/app layouts sometimes collide.

## Goals
1) Logged-out user can only see `/auth` (existing page).
2) Logged-in user visiting `/auth` is redirected to the target in `?redirect` or `/dashboard`.
3) Preserve intended destination via `?redirect` and clear it after landing.

## URLs (unchanged)
- /auth (existing page)
- /dashboard
- Other feature routes: /skills, /goals, /projects, /tasks, /monuments, /schedule, /health, /debug

## Routing Rules
- App Router with route groups:
  - `(public)` → only `/auth` (no TopNav/BottomNav)
  - `(app)` → all signed-in pages (with TopNav/BottomNav)
- Middleware:
  - If NO session and path !== `/auth`: redirect → `/auth?redirect=<path+search>`
  - If session AND path starts with `/auth`: redirect → `?redirect` or `/dashboard`
  - Matcher excludes `_next`, `api`, and static assets

## Constraints
- Reuse my existing `/auth` page (do not create a new one; move if needed).
- Do not rename URLs.
- Keep existing Supabase envs.

## Acceptance Tests
1) GET `/` logged-out → 302 `/auth`
2) GET `/dashboard` logged-out → 302 `/auth?redirect=/dashboard`
3) Login on `/auth?redirect=/skills` → lands on `/skills` and clears query
4) GET `/auth` while logged-in → 302 `/dashboard`
5) Refresh any `(app)` route while logged-in stays on that route (session persists)
6) `(public)` layout shows NO app chrome; `(app)` layout shows app chrome
7) `_next`, `api`, static assets aren’t intercepted
