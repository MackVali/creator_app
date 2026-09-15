import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260915051350_create_canonical_todos.sql",
);
const migrationSql = readFileSync(migrationPath, "utf8");

describe("canonical todos migration", () => {
  it("creates the canonical todos table with RLS policies", () => {
    expect(migrationSql).toContain("create table public.todos");
    expect(migrationSql).toContain("id uuid primary key default gen_random_uuid()");
    expect(migrationSql).toContain("owner_type in ('MY_LIST', 'GOAL', 'AREA', 'MONUMENT', 'SKILL')");
    expect(migrationSql).toContain("alter table public.todos enable row level security");
    expect(migrationSql).toContain("to authenticated");
    expect(migrationSql).toContain("using ((select auth.uid()) = user_id)");
    expect(migrationSql).toContain("with check ((select auth.uid()) = user_id)");
  });

  it("preserves list ownership guarantees and useful query indexes", () => {
    expect(migrationSql).toContain("foreign key (user_id, list_id)");
    expect(migrationSql).toContain("references public.my_list_lists(user_id, id)");
    expect(migrationSql).toContain("on public.todos (user_id, deleted_at, owner_type, owner_id)");
    expect(migrationSql).toContain("on public.todos (user_id, list_id, deleted_at, sort_order)");
    expect(migrationSql).toContain("on public.todos (note_id, deleted_at, sort_order)");
  });

  it("backfills manual My List rows without deleting legacy data", () => {
    expect(migrationSql).toContain("from public.my_list_items");
    expect(migrationSql).toContain("where my_list_items.item_kind = 'MANUAL'");
    expect(migrationSql).toContain("my_list_items.id");
    expect(migrationSql).toContain("'MY_LIST'");
    expect(migrationSql).toContain("'legacySource', 'my_list_items'");
    expect(migrationSql.toLowerCase()).not.toContain("delete from public.my_list_items");
    expect(migrationSql.toLowerCase()).not.toContain("update public.my_list_items");
  });

  it("backfills note metadata todos from arrays and objects with preserved ids", () => {
    expect(migrationSql).toContain("from public.notes");
    expect(migrationSql).toContain("jsonb_array_elements(");
    expect(migrationSql).toContain("then notes.metadata->'noteTodos'");
    expect(migrationSql).toContain("jsonb_each(");
    expect(migrationSql).toContain("(todo->>'id')::uuid");
    expect(migrationSql).toContain("notes.area_id is not null then 'AREA'");
    expect(migrationSql).toContain("notes.monument_id is not null then 'MONUMENT'");
    expect(migrationSql).toContain("'SKILL'");
    expect(migrationSql.toLowerCase()).not.toContain("update public.notes");
  });

  it("backfills goal workspace todos from arrays and objects with preserved ids", () => {
    expect(migrationSql).toContain("from public.goal_workspaces");
    expect(migrationSql).toContain("jsonb_array_elements(");
    expect(migrationSql).toContain("then goal_workspaces.metadata->'noteTodos'");
    expect(migrationSql).toContain("jsonb_each(");
    expect(migrationSql).toContain("'GOAL'");
    expect(migrationSql).toContain("goal_id::text");
    expect(migrationSql).toContain("(todo->>'id')::uuid");
    expect(migrationSql.toLowerCase()).not.toContain("update public.goal_workspaces");
  });

  it("keeps backfills idempotent around preserved primary ids", () => {
    const conflictHandlers = migrationSql.match(/on conflict \(id\) do update/g) ?? [];

    expect(conflictHandlers).toHaveLength(3);
    expect(migrationSql).toContain("where public.todos.deleted_at is null");
  });
});
