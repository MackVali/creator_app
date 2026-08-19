import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const areaDetailSource = readFileSync(
  "src/components/areas/AreaDetail.tsx",
  "utf8"
);
const areasContainerSource = readFileSync(
  "src/components/areas/AreasContainer.tsx",
  "utf8"
);
const fabSource = readFileSync("components/ui/Fab.tsx", "utf8");
const focusPomoSource = readFileSync("src/components/focus/FocusPomo.tsx", "utf8");
const migrationSource = readFileSync(
  "supabase/migrations/20260817022513_add_creator_areas.sql",
  "utf8"
);
const supabaseTypesSource = readFileSync("src/types/supabase.ts", "utf8");

function sliceWithin(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("Creator Area architecture pass", () => {
  it("moves Area detail into a real component without placeholder charging UI", () => {
    expect(areasContainerSource).toContain(
      'import { AreaDetail } from "@/components/areas/AreaDetail"'
    );
    expect(areasContainerSource).not.toContain("function AreaDetail");
    expect(areaDetailSource).not.toContain("Not connected");
    expect(areaDetailSource).not.toContain("Area dashboard");
    expect(areaDetailSource).not.toContain("Area charging");
  });

  it("renders Area-scoped Focus Pomo and the real goal/roadmap surface", () => {
    expect(areaDetailSource).toContain('sourceType: "area"');
    expect(areaDetailSource).toContain('aria-label={`Start focus pomo for ${area.label}`}');
    expect(areaDetailSource).toContain("<Timer");
    expect(areaDetailSource).toContain("<MonumentGoalsList");
    expect(areaDetailSource).toContain('sourceType="area"');
    expect(areaDetailSource).toContain("areaId={area.id}");
    expect(areaDetailSource).toContain("<BodyAreaDashboard />");
  });

  it("keeps Focus Pomo and Fab goal creation aware of Area as a first-class source", () => {
    expect(focusPomoSource).toContain(
      'export type FocusPomoSourceType = "monument" | "skill" | "area"'
    );
    expect(focusPomoSource).toContain('if (source.sourceType === "skill")');
    expect(fabSource).toContain('type GoalRelationType = "MONUMENT" | "CIRCLE" | "AREA" | null');
    expect(fabSource).toContain("selectedAreaId: string | null");
    expect(fabSource).toContain("setGoalAreaId(relationId)");
    expect(fabSource).toContain("area_id: goalRelationResolution.selectedAreaId");
  });

  it("declares the areas table, seed rows, and user-content foreign keys", () => {
    expect(migrationSource).toContain("create table if not exists public.areas");
    expect(migrationSource).toContain("alter table public.areas enable row level security");
    expect(migrationSource).toContain("grant select on table public.areas to authenticated");
    expect(migrationSource).toContain("('body', 'body', 'Body', 1)");
    expect(migrationSource).toContain("goals_area_id_fkey");
    expect(migrationSource).toContain("roadmaps_area_id_fkey");
    expect(migrationSource).toContain("campaigns_primary_area_id_fkey");
  });

  it("keeps generated Supabase types aligned to the new Area schema", () => {
    const areaTable = sliceWithin(
      supabaseTypesSource,
      "      areas: {",
      "      badges: {"
    );
    const goalsTable = sliceWithin(
      supabaseTypesSource,
      "      goals: {",
      "      habit_completion_days: {"
    );
    const roadmapsTable = sliceWithin(
      supabaseTypesSource,
      "      roadmaps: {",
      "      schedule_instances: {"
    );
    const campaignsTable = sliceWithin(
      supabaseTypesSource,
      "      campaigns: {",
      "      cats: {"
    );

    expect(areaTable).toContain("sort_order: number");
    expect(goalsTable).toContain("area_id: string | null");
    expect(goalsTable).toContain('foreignKeyName: "goals_area_id_fkey"');
    expect(roadmapsTable).toContain("area_id: string | null");
    expect(roadmapsTable).toContain('foreignKeyName: "roadmaps_area_id_fkey"');
    expect(campaignsTable).toContain("primary_area_id: string | null");
    expect(campaignsTable).toContain(
      'foreignKeyName: "campaigns_primary_area_id_fkey"'
    );
  });
});
