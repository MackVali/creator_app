import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sqlPath = resolve(
  process.cwd(),
  "supabase/manual/20260729_repair_nutrition_meal_templates_vali_v19.sql",
);
const sql = readFileSync(sqlPath, "utf8");

describe("manual Nutrition meal template repair SQL", () => {
  it("is a complete manual-only VALI-v19 transaction", () => {
    expect(sql).toContain("VALI-v19 manual repair");
    expect(sql).toContain("Codex must not execute it");
    expect(sql.trimStart()).toMatch(/^--[\s\S]*?\nbegin;/i);
    expect(sql.trimEnd()).toMatch(/commit;$/i);
  });

  it("installs the canonical saved-template parent and item child tables", () => {
    expect(sql).toMatch(/create table if not exists public\.meal_templates/i);
    expect(sql).toMatch(/create table if not exists public\.meal_template_items/i);
    expect(sql).toMatch(/meal_template_id uuid not null references public\.meal_templates\(id\) on delete cascade/i);
    expect(sql).not.toMatch(/create table if not exists public\.meal_items/i);
    expect(sql).not.toMatch(/references public\.meal_items/i);
  });

  it("includes the API-required columns and owner-scoped loading index", () => {
    expect(sql).toContain("user_id uuid not null references auth.users(id) on delete cascade");
    expect(sql).toContain("name text not null");
    expect(sql).toContain("icon text not null default");
    expect(sql).toContain("total_calories numeric not null default 0");
    expect(sql).toContain("total_carbs_g numeric not null default 0");
    expect(sql).toContain("total_protein_g numeric not null default 0");
    expect(sql).toContain("total_fat_g numeric not null default 0");
    expect(sql).toContain("metadata jsonb not null default '{}'::jsonb");
    expect(sql).toContain("is_active boolean not null default true");
    expect(sql).toMatch(/meal_templates_user_active_updated_idx[\s\S]*user_id, is_active, updated_at desc/i);
  });

  it("installs RLS, owner-only policies, grants, triggers, and schema-cache refresh", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain('create policy "meal_templates_select_own"');
    expect(sql).toContain('create policy "meal_templates_insert_own"');
    expect(sql).toContain('create policy "meal_templates_update_own"');
    expect(sql).toContain('create policy "meal_templates_delete_own"');
    expect(sql).toContain('create policy "meal_template_items_select_own"');
    expect(sql).toContain("execute function public.set_updated_at()");
    expect(sql).toContain("grant select, insert, update, delete on public.meal_templates to authenticated");
    expect(sql).toContain("grant select, insert, update, delete on public.meal_template_items to authenticated");
    expect(sql).toContain("notify pgrst, 'reload schema'");
  });
});
