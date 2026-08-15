// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnalyticsOverviewDailyPoint } from "../../src/types/analytics";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock(
  "@/components/FlameEmber",
  async () => {
    const React = await import("react");

    return {
      default: () => React.createElement("div", { "data-flame-ember": true }),
    };
  }
);

vi.mock("@/components/ui/button", async () => {
  const React = await import("react");

  return {
    Button: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement("button", props, children),
  };
});

vi.mock("recharts", async () => {
  const React = await import("react");

  return {
    Area: (props: { dataKey: string; name: string }) =>
      React.createElement("g", {
        "data-area-key": props.dataKey,
        "data-area-name": props.name,
      }),
    AreaChart: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("svg", { "data-area-chart": true }, children),
    CartesianGrid: () => React.createElement("g", { "data-grid": true }),
    XAxis: () => React.createElement("g", { "data-x-axis": true }),
    YAxis: () => React.createElement("g", { "data-y-axis": true }),
  };
});

vi.mock("@/components/ui/chart", async () => {
  const React = await import("react");

  return {
    ChartContainer: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", { ...props, "data-chart-container": true }, children),
    ChartTooltip: () => React.createElement("g", { "data-tooltip": true }),
    ChartTooltipContent: () =>
      React.createElement("div", { "data-tooltip-content": true }),
  };
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const basePoint = (
  date: string,
  totalXp: number,
  xpGained: number
): AnalyticsOverviewDailyPoint => ({
  date,
  totalXp,
  xpGained,
  projectXp: 0,
  habitXp: 0,
  taskXp: xpGained,
  completedEvents: 0,
  completedGoals: 0,
  completedProjects: 0,
  completedHabits: 0,
  completedTasks: 0,
  scheduledEvents: 0,
  missedEvents: 0,
  usableWindowMinutes: 0,
  completedMinutes: 0,
  efficiencyRate: 0,
});

async function renderChart() {
  const { OverviewLineChart } = await import("../../components/AnalyticsDashboard");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(OverviewLineChart, {
        points: [
          basePoint("2026-07-27", 50, 50),
          basePoint("2026-07-28", 70, 20),
          basePoint("2026-07-29", 70, 0),
        ],
        range: "7d",
        onSelectedPointIndexChange: vi.fn(),
      })
    );
  });

  return { container, root };
}

describe("OverviewLineChart XP modes", () => {
  let mountedRoot: Root | null = null;

  afterEach(() => {
    if (mountedRoot) {
      act(() => {
        mountedRoot?.unmount();
      });
    }
    mountedRoot = null;
    document.body.innerHTML = "";
  });

  it("defaults to cumulative total XP mode", async () => {
    const { container, root } = await renderChart();
    mountedRoot = root;

    expect(container.textContent).toContain("Total XP over time");
    expect(container.textContent).toContain("7D · 70 XP total");
    expect(
      container.querySelector<HTMLButtonElement>('button[aria-label="Show Total XP"]')
        ?.getAttribute("aria-pressed")
    ).toBe("true");
    expect(container.querySelector("[data-area-key]")?.getAttribute("data-area-key"))
      .toBe("totalXp");
  });

  it("switches to per-bucket XP gained without refetching data", async () => {
    const { container, root } = await renderChart();
    mountedRoot = root;

    const gainedButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Show XP Gained"]'
    );
    expect(gainedButton).not.toBeNull();

    await act(async () => {
      gainedButton?.click();
    });

    expect(container.textContent).toContain("XP gained over time");
    expect(container.textContent).toContain("7D · 70 XP gained");
    expect(gainedButton?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-area-key]")?.getAttribute("data-area-key"))
      .toBe("xpGained");
  });
});
