import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260722000003_temp_habit_lifecycle.sql"
  ),
  "utf8"
).toLowerCase();
const enumSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260722000002_ensure_temp_habit_type_for_lifecycle.sql"
  ),
  "utf8"
).toLowerCase();

describe("TEMP habit lifecycle migration", () => {
  it("keeps enum creation in a committed prerequisite migration", () => {
    expect(enumSql.trim()).toBe("alter type public.habit_type_enum add value if not exists 'temp';");
    expect(sql).not.toContain("add value");
  });

  it("adds skipped TEMP-support columns before lifecycle constraints", () => {
    expect(sql.indexOf("add column if not exists goal_id")).toBeGreaterThanOrEqual(0);
    expect(sql.indexOf("add column if not exists completion_target")).toBeGreaterThanOrEqual(0);
    expect(sql.indexOf("add column if not exists finished_at")).toBeGreaterThanOrEqual(0);
    expect(sql.indexOf("add column if not exists completion_target")).toBeLessThan(
      sql.indexOf("habit_type <> 'temp'")
    );
  });

  it("uses authoritative completion days and an idempotent day write", () => {
    expect(sql).toContain("on conflict (habit_id, completion_day) do update");
    expect(sql).toContain("select count(*) into v_count from public.habit_completion_days");
  });

  it("limits rpc execution to authenticated callers", () => {
    expect(sql).toContain(
      "revoke execute on function public.set_habit_completion_day(uuid, date, timestamptz, boolean) from public"
    );
    expect(sql).toContain(
      "revoke execute on function public.set_habit_completion_day(uuid, date, timestamptz, boolean) from anon"
    );
    expect(sql).toContain(
      "grant execute on function public.set_habit_completion_day(uuid, date, timestamptz, boolean) to authenticated"
    );
  });

  it("finishes and reactivates without changing historical events", () => {
    expect(sql).toContain("else null");
    expect(sql).toContain("status = 'scheduled'");
    expect(sql).toContain("start_utc >= now()");
    expect(sql).not.toMatch(/delete from public\.schedule_instances/);
  });

  it("reconciles lifecycle when completion days are written outside the rpc", () => {
    expect(sql).toContain("create or replace function public.reconcile_temp_habit_from_completion_days");
    expect(sql).toContain("after insert or update or delete on public.habit_completion_days");
    expect(sql).toContain("where id = v_habit_id and habit_type = 'temp'");
    expect(sql).toContain("for update");
  });

  it("detaches TEMP habits before a referenced goal is deleted", () => {
    expect(sql).toContain("create or replace function public.detach_temp_habits_before_goal_delete");
    expect(sql).toContain("before delete on public.goals");
    expect(sql).toContain("set habit_type = 'habit'");
    expect(sql).toContain("completion_target = null");
    expect(sql).toContain("finished_at = null");
  });

  it("narrows source-update invalidation away from progress metadata", () => {
    const trigger = sql.slice(sql.indexOf("create trigger mark_schedule_instances_on_habit_update"));
    expect(trigger).not.toContain("old.* is distinct from new.*");
    expect(trigger).not.toContain("current_streak_days");
    expect(trigger).not.toContain("finished_at is distinct from");
  });
});
