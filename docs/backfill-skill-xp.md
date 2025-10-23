# Skill XP Backfill Script

When skill levels are edited directly in the `skills` table the leveling
pipeline is bypassed. No `xp_events` are recorded, which means the leveling
engine never emits matching `dark_xp_events` or updates `user_progress`. The
`user_progress` snapshot is what powers the global user level, so manual edits
leave the level stuck at its previous value.

The `scripts/backfill-skill-xp.js` utility replays the missing progress. It
compares each skill's stored level to the leveling snapshot in
`skill_progress`. When it finds a mismatch it inserts a compensating row into
`xp_events`, letting the existing database triggers regenerate the
`dark_xp_events` and resync the user-level totals.

## Prerequisites

1. **Service role access** – the script talks directly to Supabase and needs a
   key that can read/write the leveling tables. Add the following to your
   `.env.local` (or export them in your shell) before running anything:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL="https://<your-project>.supabase.co"
   SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
   ```

2. **Install dependencies** – the script relies on the workspace's `node`
   runtime and packages. From the repo root run `pnpm install` once if you
   haven't already.

3. **Optional: narrow the scope** – if you only need to repair a single user,
   copy their UUID. The script accepts it via `--user` so you do not have to
   process every account.

## Quick start

Always start with a dry run. This prints the skills that are out of sync and
how much XP would be inserted without actually mutating the database:

```bash
pnpm exec node scripts/backfill-skill-xp.js --dry-run
```

Sample output:

```
🎯 Backfilling skill XP via xp_events
   Dry run: yes

📚 Loaded 3 skills to inspect.
➡️  Skill 123 (user 456) is at level 5 but should be 9. Needs 38 XP.

✅ Would insert 1 xp_events totalling 38 XP.
   Re-run without --dry-run to apply the changes.
```

If everything looks correct, run the script again without `--dry-run` (and with
`--user <uuid>` if you want to restrict the operation):

```bash
pnpm exec node scripts/backfill-skill-xp.js [--user <uuid>]
```

## What happens behind the scenes?

For every skill that needs XP the script inserts a synthetic `xp_events` row.
The existing database triggers then do the rest:

1. `apply_skill_xp` updates `skill_progress` for the skill and emits one
   `dark_xp_events` row per level gained.
2. `on_dark_xp_after` adds the dark XP into `user_progress`, updating the user
   level totals.

Once the script finishes the user level and per-skill snapshots will line up
with the manual edits.

## Verifying the results (optional)

You can confirm the changes from SQL after the write:

```sql
select total_dark_xp, current_level from user_progress where user_id = '<uuid>';
select level, xp_into_level from skill_progress where skill_id = '<skill-id>';
select level from skills where id = '<skill-id>';
```

All three queries should now report consistent values.
