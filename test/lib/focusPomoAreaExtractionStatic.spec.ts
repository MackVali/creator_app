import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const focusPomoSource = readFileSync(
  "src/components/focus/FocusPomo.tsx",
  "utf8"
);

function readAreaExtractionSource(): string {
  const match = focusPomoSource.match(
    /function getFocusPomoCompletionAreaIds[\s\S]+?\n}\n\nfunction buildFocusPomoAwardKeyBase/
  );
  if (!match) throw new Error("FocusPomo Area extraction helper not found.");
  return match[0];
}

describe("FocusPomo Area extraction", () => {
  it("keeps Habit Area extraction canonical and type-aware", () => {
    const helperSource = readAreaExtractionSource();
    const habitBranch = helperSource.match(
      /if \(itemKind === "habit"\) \{[\s\S]+?\n  \}/
    )?.[0];

    expect(habitBranch).toContain("return uniqueScopeValues(canonicalAreaIds)");
    expect(habitBranch).not.toContain("goal_area_id");
    expect(habitBranch).not.toContain("goalAreaId");
    expect(helperSource).not.toContain("campaign_area_id");
    expect(helperSource).not.toContain("campaignAreaId");
  });

  it("allows Project and Task Area fallback from Goal Area metadata", () => {
    const helperSource = readAreaExtractionSource();
    const projectTaskBranch = helperSource.match(
      /if \(itemKind === "project" \|\| itemKind === "task"\) \{[\s\S]+?\n  \}/
    )?.[0];

    expect(projectTaskBranch).toContain("goal_area_id");
    expect(projectTaskBranch).toContain("goalAreaId");
  });
});
