import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { ensureGoalGlobalPriorityOrder } from "@/lib/goals/globalPriorityOrder";

type Filter = {
  method: "eq" | "in";
  column: string;
  value: unknown;
};

type QueryCall = {
  table: string;
  action: "select" | "update";
  filters: Filter[];
  payload?: unknown;
};

type MockRows = {
  goal: Record<string, unknown> | null;
  goalCampaignLinks?: Array<{ campaign_id: string }>;
  allCampaignGoalRows?: Array<{ goal_id: string }>;
  siblingCampaignGoalRows?: Array<{ goal_id: string }>;
  goalRows?: Array<Record<string, unknown>>;
  siblingGoalRows?: Array<Record<string, unknown>>;
  campaignRows?: Array<Record<string, unknown>>;
};

function hasFilter(call: QueryCall, column: string) {
  return call.filters.some((filter) => filter.column === column);
}

function createSupabaseMock(rows: MockRows) {
  const calls: QueryCall[] = [];

  const resolve = (call: QueryCall) => {
    calls.push({
      ...call,
      filters: call.filters.map((filter) => ({ ...filter })),
    });

    if (call.action === "update") {
      return { data: null, error: null };
    }

    if (call.table === "campaign_goals" && hasFilter(call, "goal_id")) {
      return { data: rows.goalCampaignLinks ?? [], error: null };
    }

    if (call.table === "campaign_goals" && hasFilter(call, "campaign_id")) {
      return { data: rows.siblingCampaignGoalRows ?? [], error: null };
    }

    if (call.table === "campaign_goals") {
      return { data: rows.allCampaignGoalRows ?? [], error: null };
    }

    if (call.table === "goals" && hasFilter(call, "user_id") && hasFilter(call, "id")) {
      return { data: rows.siblingGoalRows ?? [], error: null };
    }

    if (call.table === "goals" && hasFilter(call, "id")) {
      return { data: rows.goal, error: null };
    }

    if (call.table === "goals") {
      return { data: rows.goalRows ?? [], error: null };
    }

    if (call.table === "campaigns") {
      return { data: rows.campaignRows ?? [], error: null };
    }

    return { data: [], error: null };
  };

  const client = {
    from: vi.fn((table: string) => {
      const call: QueryCall = {
        table,
        action: "select",
        filters: [],
      };

      const builder = {
        select: () => builder,
        update: (payload: unknown) => {
          call.action = "update";
          call.payload = payload;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          call.filters.push({ method: "eq", column, value });
          return builder;
        },
        in: (column: string, value: unknown[]) => {
          call.filters.push({ method: "in", column, value });
          return builder;
        },
        maybeSingle: () => Promise.resolve(resolve(call)),
        then: (onFulfilled?: (value: unknown) => unknown, onRejected?: () => unknown) =>
          Promise.resolve(resolve(call)).then(onFulfilled, onRejected),
      };

      return builder;
    }),
  };

  return { calls, client };
}

function updatePayloads(calls: QueryCall[]) {
  return calls
    .filter((call) => call.table === "goals" && call.action === "update")
    .map((call) => call.payload);
}

describe("ensureGoalGlobalPriorityOrder", () => {
  it("appends a new standalone active Goal after existing top-level items without using weight", async () => {
    const { calls, client } = createSupabaseMock({
      goal: {
        id: "new-goal",
        user_id: "user-1",
        priority_code: "HIGH",
        priority_order: null,
        status: "ACTIVE",
        circle_id: null,
      },
      goalCampaignLinks: [],
      allCampaignGoalRows: [{ goal_id: "campaign-goal" }],
      goalRows: [
        {
          id: "ordered-goal",
          priority_code: "HIGH",
          priority_order: 2,
          status: "ACTIVE",
          circle_id: null,
        },
        {
          id: "campaign-goal",
          priority_code: "HIGH",
          priority_order: 99,
          status: "ACTIVE",
          circle_id: null,
        },
      ],
      campaignRows: [{ priority_order: 5 }],
    });

    await ensureGoalGlobalPriorityOrder({
      supabase: client as never,
      goalId: "new-goal",
    });

    expect(updatePayloads(calls)).toEqual([
      { priority_code: "HIGH", priority_order: 6 },
    ]);
    expect(JSON.stringify(updatePayloads(calls))).not.toContain("global_rank");
  });

  it("does nothing when the Goal already has valid priority_order", async () => {
    const { calls, client } = createSupabaseMock({
      goal: {
        id: "ordered-goal",
        user_id: "user-1",
        priority_code: "HIGH",
        priority_order: 3,
        status: "ACTIVE",
        circle_id: null,
      },
    });

    await ensureGoalGlobalPriorityOrder({
      supabase: client as never,
      goalId: "ordered-goal",
    });

    expect(updatePayloads(calls)).toEqual([]);
  });

  it("appends a campaign-linked Goal inside its campaign priority bucket", async () => {
    const { calls, client } = createSupabaseMock({
      goal: {
        id: "new-goal",
        user_id: "user-1",
        priority_code: "HIGH",
        priority_order: null,
        status: "ACTIVE",
        circle_id: null,
      },
      goalCampaignLinks: [{ campaign_id: "campaign-1" }],
      siblingCampaignGoalRows: [
        { goal_id: "new-goal" },
        { goal_id: "sibling-high" },
        { goal_id: "sibling-low" },
        { goal_id: "completed-high" },
      ],
      siblingGoalRows: [
        {
          id: "sibling-high",
          priority_code: "HIGH",
          priority_order: 4,
          status: "ACTIVE",
          circle_id: null,
        },
        {
          id: "sibling-low",
          priority_code: "LOW",
          priority_order: 20,
          status: "ACTIVE",
          circle_id: null,
        },
        {
          id: "completed-high",
          priority_code: "HIGH",
          priority_order: 30,
          status: "COMPLETED",
          circle_id: null,
        },
      ],
    });

    await ensureGoalGlobalPriorityOrder({
      supabase: client as never,
      goalId: "new-goal",
    });

    expect(updatePayloads(calls)).toEqual([
      { priority_code: "HIGH", priority_order: 5 },
    ]);
  });

  it("restores priority_order for a paused non-completed Goal before reactivation rank recalculation", async () => {
    const { calls, client } = createSupabaseMock({
      goal: {
        id: "paused-goal",
        user_id: "user-1",
        priority_code: "MEDIUM",
        priority_order: null,
        status: "PAUSED",
        circle_id: null,
      },
      goalCampaignLinks: [],
      goalRows: [],
      campaignRows: [],
    });

    await ensureGoalGlobalPriorityOrder({
      supabase: client as never,
      goalId: "paused-goal",
    });

    expect(updatePayloads(calls)).toEqual([
      { priority_code: "MEDIUM", priority_order: 1 },
    ]);
  });

  it("leaves circle and completed Goals out of global ordering", async () => {
    const completed = createSupabaseMock({
      goal: {
        id: "completed-goal",
        user_id: "user-1",
        priority_code: "HIGH",
        priority_order: null,
        status: "COMPLETED",
        circle_id: null,
      },
    });
    const circle = createSupabaseMock({
      goal: {
        id: "circle-goal",
        user_id: "user-1",
        priority_code: "HIGH",
        priority_order: null,
        status: "ACTIVE",
        circle_id: "circle-1",
      },
    });

    await ensureGoalGlobalPriorityOrder({
      supabase: completed.client as never,
      goalId: "completed-goal",
    });
    await ensureGoalGlobalPriorityOrder({
      supabase: circle.client as never,
      goalId: "circle-goal",
    });

    expect(updatePayloads(completed.calls)).toEqual([]);
    expect(updatePayloads(circle.calls)).toEqual([]);
  });
});

describe("Goal global priority lifecycle wiring", () => {
  it("does not derive goal global_rank from weight in the create page", () => {
    const page = readFileSync(
      join(process.cwd(), "src/app/(app)/goals/page.tsx"),
      "utf8"
    );

    expect(page).not.toContain("persistGoalGlobalRanks");
    expect(page).not.toContain("global_rank: index + 1");
    expect(page).toContain("ensureGoalGlobalPriorityOrder");
    expect(page).toContain('"recalculate_goal_global_rank"');
  });

  it("recalculates project ranks after canonical goal ranks", () => {
    const page = readFileSync(
      join(process.cwd(), "src/app/(app)/goals/page.tsx"),
      "utf8"
    );

    expect(page.indexOf('"recalculate_goal_global_rank"')).toBeGreaterThan(-1);
    expect(page.indexOf('"recalculate_project_global_rank"')).toBeGreaterThan(
      page.indexOf('"recalculate_goal_global_rank"')
    );
  });

  it("keeps generic goal updates from leaving missing priority_order behind", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/goals/persistGoalUpdate.ts"),
      "utf8"
    );

    expect(source).toContain("ensureGoalGlobalPriorityOrder");
    expect(source.indexOf("ensureGoalGlobalPriorityOrder")).toBeLessThan(
      source.indexOf('"recalculate_goal_global_rank"')
    );
  });
});
