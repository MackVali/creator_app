import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  "src/app/api/focus-pomo/scheduled-events/route.ts",
  "utf8"
);

describe("FocusPomo scheduled Events mapping", () => {
  it("preserves scheduled TASK instances as task queue items", () => {
    const kindFunction = routeSource.match(
      /function kindForSourceType[\s\S]+?\n}\n\nfunction matchesProvidedIdentity/
    )?.[0];

    expect(kindFunction).toContain('if (normalized === "TASK") return "task"');
  });
});
