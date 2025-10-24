# Scheduler Habit Alignment Plan

## Observed Problems
- The Supabase `scheduler_cron` edge function queues and places only project instances. It never loads habits, so cron-triggered runs cannot reserve time for habits or mark their occupancy.
- The Next.js scheduler (`src/lib/scheduler/reschedule.ts`) now performs three passes (non-sync habits → projects → sync habits) and persists habit placements. Because the edge function bypasses that code, the database receives only project rows; the UI therefore renders projects with no knowledge of habits.
- Fetch logic on the schedule page now expects habit placements to exist in `schedule_instances`. Without cron writing those rows, schedule views appear empty or overlapping once the client relies solely on persisted data.

## Proposed Fix

1. **Extract shared scheduling core**
   - Move the habit/project scheduling pipeline from `src/lib/scheduler/reschedule.ts` into a framework-neutral module (e.g., `src/lib/scheduler/runScheduler.ts`).
   - The shared module should export `markMissedAndQueue`, `scheduleBacklog`, and helper types that only depend on:
     * the Supabase client interface,
     * scheduler utilities already written in TypeScript (timezone helpers, habit/project builders, placement logic), and
     * configuration constants.
   - In the Next.js path, re-export these helpers so existing imports remain valid.

2. **Update the Supabase edge function**
   - Replace the bespoke queueing logic in `supabase/functions/scheduler_cron/index.ts` with imports from the shared scheduler module using an ESM build (e.g., `import { scheduleBacklog, markMissedAndQueue } from '../../../dist/scheduler/runScheduler.js'`).
   - Supply the Deno Supabase client when calling the shared helpers; they already accept a generic client.
   - Ensure the edge function forwards the same options (`timeZone`, location) that the Next.js scheduler consumes so the behavior matches.

3. **Align habit persistence**
   - After `scheduleBacklog` finishes, confirm the returned payload includes habit placements and that `persistHabitPlacements` runs as part of the shared pipeline.
   - Remove any redundant habit clean-up logic from the edge function, since the shared scheduler already handles cancel/reschedule semantics.

4. **Testing & verification**
   - Unit/Integration: run `pnpm test:env` to cover scheduler utilities.
   - Manual: trigger the Supabase function locally (curl) and verify the response includes `HABIT` placements, then load the schedule page to confirm habit cards render without overlap.
   - Regression: ensure the Next.js `reschedule` entry point still compiles and produces identical behavior.

## Rollout Considerations
- The edge function runs on Deno, so ensure any new shared module is transpiled (via `pnpm build` or `tsup`) to an ESM bundle under `supabase/functions/_shared/` or similar for import stability.
- Keep the `schedule_instances.source_type = 'HABIT'` enum migration in place; verify the Supabase project has run it before deploying the updated function.
- Monitor scheduler logs after deployment to confirm habit placements are persisted and that the queue length remains stable when habit volume increases.

