import { describe, expect, it } from "vitest";

import { dashboardTourSteps } from "../../../src/lib/tours/dashboardTour";

describe("dashboard tour", () => {
  it("does not target the dashboard Monument creation card", () => {
    expect(dashboardTourSteps.map((step) => step.id)).not.toContain("new-monument");
    expect(dashboardTourSteps.map((step) => step.selector)).not.toContain(
      '[data-tour="new-monument"]',
    );
  });
});
