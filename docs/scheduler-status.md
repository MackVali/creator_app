# Scheduler status overview

## Habit and project scheduling flow
- `scheduleBacklog` builds a queue of project items, dedupes existing project instances, and then iterates day by day through the lookahead horizon (up to 365 days). For each day within the first four weeks it first calls `scheduleHabitsForDay`, ensuring habits consume availability before project placement runs. Days beyond that window skip new habit writes so the scheduler avoids creating hundreds of Supabase rows in a single run.
- Window lookups always filter by the active user id (even when the scheduler is using a service-role Supabase client) so habit and project placement only considers the caller's availability windows.
- Habit placements fetch or create `schedule_instances` rows with `source_type = 'HABIT'`. Existing rows are rescheduled when their timing no longer matches; otherwise they are kept in place. Newly created or updated habit instances are appended to the scheduler result just like project rows.
- After habits for the day are resolved, the same availability map is reused to slot projects via `placeItemInWindows`, which persists project instances (`source_type = 'PROJECT'`) or reschedules reused ones.

## Supabase readiness
- The shared `schedule_instances` table accepts `PROJECT`, `TASK`, and `HABIT` rows via the `schedule_instance_source_type` enum, so no additional table is required for habits.
- Habit instance persistence calls the same repository helpers (`createInstance` / `rescheduleInstance`) used for projects, ensuring scheduler output and downstream consumers operate uniformly.

With these pieces in place, both projects and habits now save concrete schedule instance rows, and habit runs honor the "no overlap unless SYNC" rule through shared availability enforcement.
