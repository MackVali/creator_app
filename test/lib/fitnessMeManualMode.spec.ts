import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Fitness ME Manual / Untracked mode", () => {
  it("does not show scheduled weekly history", () => {
    const source = readFileSync("src/components/notes/NoteSlashTextarea.tsx", "utf8");
    const meContent = source.slice(
      source.indexOf("function renderFitnessMeContent"),
      source.indexOf("function renderFitnessTabContent"),
    );

    expect(meContent).toContain("Manual / Untracked");
    expect(meContent).toContain("Muscle Groups");
    expect(meContent).not.toContain("Scheduled");
    expect(meContent).not.toContain("Weekly");
  });
});
