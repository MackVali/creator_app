import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/manual/20260722_install_nutrition_profile_targets.sql", "utf8").toLowerCase();

describe("canonical Nutrition target SQL", () => {
  it("is one transaction containing all three RLS tables", () => {
    expect(sql.trim().startsWith("begin;")).toBe(true);
    expect(sql.trim().endsWith("commit;")).toBe(true);
    expect(sql.match(/\bbegin;/g)).toHaveLength(1);
    expect(sql.match(/\bcommit;/g)).toHaveLength(1);
    for (const table of ["nutrition_profiles", "nutrition_goal_versions", "daily_nutrition_targets"]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`${table}_owner_select`);
    }
  });

  it("enforces active-goal and Creator-day uniqueness plus immutability", () => {
    expect(sql).toContain("where effective_to is null");
    expect(sql).toContain("unique (user_id, creator_day_date)");
    expect(sql).toContain("prevent_nutrition_goal_version_mutation");
    expect(sql).toContain("pg_advisory_xact_lock");
  });

  it("depends only on auth users and its own goal table", () => {
    expect(sql).not.toMatch(/create\s+table(?:\s+if\s+not\s+exists)?\s+(?:public\.)?food_resources/);
    expect(sql).not.toContain("meal_templates");
    expect(sql).not.toContain("recipes");
    expect(sql).toContain("references auth.users(id)");
    expect(sql).toContain("references public.nutrition_goal_versions(id)");
  });
});
