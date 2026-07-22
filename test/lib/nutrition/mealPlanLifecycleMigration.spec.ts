import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/manual/20260722_install_complete_nutrition_meal_plan.sql"), "utf8");

describe("complete manual Meal Plan installation contract", () => {
  it("is one complete transaction that creates both tables", () => {
    expect(sql.trimStart()).toMatch(/^--[\s\S]*?begin;/i);
    expect(sql.trimEnd()).toMatch(/commit;$/i);
    expect(sql).toMatch(/create table if not exists public\.meal_plan_days/i);
    expect(sql).toMatch(/create table if not exists public\.meal_plan_items/i);
  });

  it("does not install unproven source tables or foreign keys", () => {
    expect(sql).not.toMatch(/references\s+public\.meal_templates/i);
    expect(sql).not.toMatch(/references\s+public\.recipes/i);
    expect(sql).not.toMatch(/create table(?: if not exists)?\s+public\.food_resources/i);
  });

  it("installs the final schema, RLS, and exact application RPC signatures", () => {
    expect(sql).toContain("'partially_logged'");
    expect(sql).toContain("grocery_depletion_results jsonb");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain('create policy "meal_plan_items_update_own"');
    expect(sql).toMatch(/create or replace function public\.log_meal_plan_item\(p_item_id uuid, p_occurred_at timestamptz default now\(\)\)/i);
    expect(sql).toMatch(/create or replace function public\.deplete_logged_meal_plan_item\(p_item_id uuid\)/i);
  });

  it("contains each final lifecycle function exactly once", () => {
    expect(sql.match(/create or replace function public\.log_meal_plan_item/g)).toHaveLength(1);
    expect(sql.match(/create or replace function public\.deplete_logged_meal_plan_item/g)).toHaveLength(1);
  });
  it("durably stores component-level completed and incomplete deduction states", () => {
    expect(sql).toMatch(/grocery_depletion_results jsonb not null/i);
    expect(sql).toContain("'status', 'completed'");
    expect(sql).toContain("'status', 'failed'");
  });

  it("retains the consumed meal id when depletion is partial", () => {
    expect(sql).toMatch(/status = case when v_has_deductions then 'partially_logged'[\s\S]*consumed_meal_id = v_meal_id/i);
  });

  it("treats a stored consumed meal id as authoritative", () => {
    expect(sql).toMatch(/if v_item\.consumed_meal_id is not null then/i);
    expect(sql).toContain("'retry_required', true");
  });

  it("skips completed deductions during retry", () => {
    expect(sql).toMatch(/if v_component->>'status' = 'completed' then continue; end if;/i);
  });

  it("finalizes successful retries to logged", () => {
    expect(sql).toMatch(/if v_incomplete = 0 then[\s\S]*status = 'logged'[\s\S]*return 'completed'/i);
  });

  it("leaves failed retries partially logged", () => {
    expect(sql).toMatch(/status = 'partially_logged',[\s\S]*grocery_depletion_status = 'failed'/);
  });

  it("preserves failure diagnostics across attempts", () => {
    expect(sql).toMatch(/coalesce\(v_component->'diagnostics', '\[\]'::jsonb\)[\s\S]*\|\| jsonb_build_array/i);
  });

  it("serializes initial and retry requests on the plan item", () => {
    expect(sql.match(/for update of i;/g)).toHaveLength(2);
  });

  it("keeps inventory mutation and its completion marker in one component subtransaction", () => {
    expect(sql).toMatch(/begin\s+--[^\n]*\n\s*execute 'update public\.food_resources[\s\S]*'status', 'completed'[\s\S]*exception when others then/i);
  });

  it("does not create consumed meals in the depletion retry function", () => {
    const retryFunction = sql.slice(sql.indexOf("create or replace function public.deplete_logged_meal_plan_item"));
    expect(retryFunction).not.toContain("create_nutrition_meal");
  });

  it("keeps planned when Nutrition creation raises by updating only after creation", () => {
    expect(sql.indexOf("from public.create_nutrition_meal(")).toBeLessThan(sql.indexOf("consumed_meal_id = v_meal_id"));
  });
});
