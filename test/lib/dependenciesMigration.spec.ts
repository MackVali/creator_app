import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260911071129_item_dependencies.sql"
  ),
  "utf8"
);

describe("item_dependencies migration", () => {
  it("creates one shared user-owned dependency table", () => {
    expect(migration).toContain("create table if not exists public.item_dependencies");
    expect(migration).toContain("user_id uuid not null references auth.users(id) on delete cascade");
    expect(migration).toContain("source_type in ('GOAL', 'PROJECT', 'TASK', 'HABIT')");
    expect(migration).toContain("dependency_type in ('ITEM', 'DATE', 'WEEKDAY')");
  });

  it("enforces payload shapes and singleton Date/Weekday dependencies", () => {
    expect(migration).toContain("item_dependencies_payload_shape_check");
    expect(migration).toContain("depends_on_id <> source_id");
    expect(migration).toContain("item_dependencies_one_date_per_source_idx");
    expect(migration).toContain("item_dependencies_one_weekday_per_source_idx");
  });

  it("enables own-user RLS and CRUD grants", () => {
    expect(migration).toContain(
      "alter table public.item_dependencies enable row level security"
    );
    expect(migration).toContain("to authenticated");
    expect(migration).toContain("user_id = (select auth.uid())");
    expect(migration).toContain(
      "grant select, insert, update, delete on public.item_dependencies to authenticated"
    );
  });

  it("rejects dependency cycles and cleans stale deleted relations", () => {
    expect(migration).toContain("validate_item_dependency");
    expect(migration).toContain("Dependency would create a cycle");
    expect(migration).toContain("cleanup_item_dependencies_for_deleted_item");
    expect(migration).toContain("goals_cleanup_item_dependencies");
    expect(migration).toContain("projects_cleanup_item_dependencies");
    expect(migration).toContain("tasks_cleanup_item_dependencies");
    expect(migration).toContain("habits_cleanup_item_dependencies");
  });
});
