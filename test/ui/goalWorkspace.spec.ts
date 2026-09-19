// @vitest-environment jsdom

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("../../src/app/(app)/goals/components/ProjectsDropdown", () => ({
  ProjectsDropdown: () =>
    React.createElement("div", { "data-testid": "projects-dropdown" }),
}));

vi.mock(
  "/Users/validtali/premium-app/src/app/(app)/goals/components/ProjectsDropdown.tsx",
  () => ({
    ProjectsDropdown: () =>
      React.createElement("div", { "data-testid": "projects-dropdown" }),
  }),
);

describe("GoalWorkspace", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("renders the project workspace without Goal notes", async () => {
    const { GoalWorkspace } = await import(
      "../../src/app/(app)/goals/components/GoalWorkspace"
    );

    const goal = {
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      energy: "Medium",
      id: "goal-1",
      priority: "High",
      progress: 0,
      projects: [],
      status: "ACTIVE",
      title: "Goal",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as React.ComponentProps<typeof GoalWorkspace>["goal"];

    await act(async () => {
      root.render(
        React.createElement(GoalWorkspace, {
          goal,
          loading: false,
        }),
      );
    });

    expect(
      container.querySelector('[data-testid="projects-dropdown"]'),
    ).toBeTruthy();

    expect(
      container.querySelector('[aria-label="Goal workspace"]'),
    ).toBeNull();

    expect(container.querySelector("textarea")).toBeNull();
  });
});
