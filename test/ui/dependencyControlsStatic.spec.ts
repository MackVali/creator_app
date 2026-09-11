import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fabSource = readFileSync(
  resolve(process.cwd(), "components/ui/Fab.tsx"),
  "utf8"
);

describe("Dependency editor placement", () => {
  it("uses the exact user-facing Dependency label and add button", () => {
    expect(fabSource).toContain("Dependency");
    expect(fabSource).toContain('aria-label="Add Dependency"');
    expect(fabSource).not.toContain("Blocked by");
    expect(fabSource).not.toContain("Prerequisite");
    expect(fabSource).not.toContain("Scheduling rules");
  });

  it("keeps Dependency inside existing advanced controls", () => {
    expect(fabSource).toContain('activeCreationMode === "tags"');
    expect(fabSource).toContain('activeCreationMode === "advanced"');
    expect(fabSource).toContain('renderDependencyRows("advanced")');
    expect(fabSource).not.toContain("Advanced accordion");
    expect(fabSource).not.toContain("Advanced disclosure");
  });

  it("places Unified Event Sheet Dependency inside the existing More sheet", () => {
    const moreSheetStart = fabSource.indexOf("const moreMiniSheet = (");
    const mainSheetStart = fabSource.indexOf("const sheet = (");
    const defaultDependencyIndex = fabSource.indexOf(
      '{!isEventsMode ? renderDependencyRows("unified") : null}'
    );
    const moreDependencyIndex = fabSource.indexOf(
      '{renderDependencyRows("unified")}',
      moreSheetStart
    );

    expect(moreSheetStart).toBeGreaterThan(-1);
    expect(mainSheetStart).toBeGreaterThan(moreSheetStart);
    expect(defaultDependencyIndex).toBe(-1);
    expect(moreDependencyIndex).toBeGreaterThan(moreSheetStart);
    expect(moreDependencyIndex).toBeLessThan(mainSheetStart);
  });
});
