import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  findMissingMonumentRoadmapGoalIds,
  findRedundantStandaloneRoadmapItemIds,
  findRoadmapCampaignGoalIds,
} from "../../lib/queries/roadmap-reconciliation";
import {
  addGoalToCampaign,
  addGoalToRoadmapItems,
} from "../../lib/queries/roadmaps";
import { getSupabaseBrowser } from "../../lib/supabase";

vi.mock("../../lib/supabase", () => ({
  getSupabaseBrowser: vi.fn(),
}));

type QueryAction = "select" | "insert" | "delete";

type QueryFilter = {
  method: "eq" | "in" | "not";
  column: string;
  value: unknown;
};

type QueryCall = {
  table: string;
  action: QueryAction;
  filters: QueryFilter[];
  payload?: unknown;
};

type QueryResult = {
  data: unknown;
  error: null;
};

type QueryBuilder = PromiseLike<QueryResult> & {
  select: (columns?: string) => QueryBuilder;
  insert: (payload: unknown) => QueryBuilder;
  delete: () => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  in: (column: string, value: unknown[]) => QueryBuilder;
  not: (column: string, operator: string, value: unknown) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
  single: () => Promise<QueryResult>;
};

type RoadmapMutationMockOptions = {
  nestedCampaignGoalRows?: unknown[];
};

function createRoadmapMutationMock(
  options: RoadmapMutationMockOptions = {}
) {
  const calls: QueryCall[] = [];

  const resolve = (call: QueryCall): QueryResult => {
    calls.push({
      ...call,
      filters: call.filters.map((filter) => ({ ...filter })),
    });

    if (call.table === "campaigns") {
      return { data: [{ roadmap_id: "roadmap-1" }], error: null };
    }

    if (call.table === "roadmap_items" && call.action === "select") {
      return {
        data: [{ roadmap_id: "roadmap-1", campaign_id: "campaign-1" }],
        error: null,
      };
    }

    if (call.table === "campaign_goals" && call.action === "select") {
      return {
        data: options.nestedCampaignGoalRows ?? [],
        error: null,
      };
    }

    if (call.table === "campaign_goals" && call.action === "insert") {
      return {
        data: {
          campaign_id: "campaign-1",
          goal_id: "goal-1",
          position: 2,
        },
        error: null,
      };
    }

    return { data: [], error: null };
  };

  const client = {
    from: vi.fn((table: string): QueryBuilder => {
      const call: QueryCall = {
        table,
        action: "select",
        filters: [],
      };

      const builder: QueryBuilder = {
        select: () => builder,
        insert: (payload) => {
          call.action = "insert";
          call.payload = payload;
          return builder;
        },
        delete: () => {
          call.action = "delete";
          return builder;
        },
        eq: (column, value) => {
          call.filters.push({ method: "eq", column, value });
          return builder;
        },
        in: (column, value) => {
          call.filters.push({ method: "in", column, value });
          return builder;
        },
        not: (column, operator, value) => {
          call.filters.push({
            method: "not",
            column,
            value: { operator, value },
          });
          return builder;
        },
        limit: () => builder,
        single: () => Promise.resolve(resolve(call)),
        then: (onFulfilled, onRejected) =>
          Promise.resolve(resolve(call)).then(onFulfilled, onRejected),
      };

      return builder;
    }),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  };

  return { calls, client };
}

beforeEach(() => {
  vi.mocked(getSupabaseBrowser).mockReset();
});

describe("findMissingMonumentRoadmapGoalIds", () => {
  it("returns monument goals not represented by top-level roadmap items or campaigns", () => {
    expect(
      findMissingMonumentRoadmapGoalIds({
        monumentGoalIds: ["goal-1", "goal-2", "goal-3", "goal-4"],
        roadmapGoalItemIds: ["goal-1"],
        campaignGoalIds: ["goal-3"],
      })
    ).toEqual(["goal-2", "goal-4"]);
  });

  it("deduplicates repeated monument goal ids while preserving first-seen order", () => {
    expect(
      findMissingMonumentRoadmapGoalIds({
        monumentGoalIds: ["goal-2", "goal-1", "goal-2", "goal-3"],
        roadmapGoalItemIds: ["goal-1"],
        campaignGoalIds: [],
      })
    ).toEqual(["goal-2", "goal-3"]);
  });
});

describe("roadmap campaign membership reconciliation", () => {
  const roadmapItems = [
    {
      id: "standalone-before-campaign",
      roadmap_id: "roadmap-1",
      item_type: "GOAL",
      goal_id: "goal-2",
      position: 1,
    },
    {
      id: "campaign-item",
      roadmap_id: "roadmap-1",
      item_type: "CAMPAIGN",
      campaign_id: "campaign-1",
      position: 2,
    },
    {
      id: "standalone-kept",
      roadmap_id: "roadmap-1",
      item_type: "GOAL",
      goal_id: "goal-3",
      position: 3,
    },
    {
      id: "other-roadmap-standalone",
      roadmap_id: "roadmap-2",
      item_type: "GOAL",
      goal_id: "goal-2",
      position: 1,
    },
  ];

  const campaignGoals = [
    {
      campaign_id: "campaign-1",
      goal_id: "goal-1",
      position: 1,
    },
    {
      campaign_id: "campaign-1",
      goal_id: "goal-2",
      position: 2,
    },
  ];

  it("maps campaign child goals to the roadmap that contains the campaign item", () => {
    const goalIdsByRoadmapId = findRoadmapCampaignGoalIds({
      roadmapItems,
      campaignGoals,
    });

    expect(goalIdsByRoadmapId.get("roadmap-1")).toEqual(
      new Set(["goal-1", "goal-2"])
    );
    expect(goalIdsByRoadmapId.has("roadmap-2")).toBe(false);
  });

  it("identifies only redundant standalone rows in the same roadmap", () => {
    expect(
      findRedundantStandaloneRoadmapItemIds({
        roadmapItems,
        campaignGoals,
      })
    ).toEqual(new Set(["standalone-before-campaign"]));
  });
});

describe("roadmap campaign membership mutations", () => {
  it("removes standalone roadmap goal items when adding that goal to a campaign in the same roadmap", async () => {
    const { calls, client } = createRoadmapMutationMock();
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);

    await expect(
      addGoalToCampaign("user-1", {
        campaignId: "campaign-1",
        goalId: "goal-1",
        position: 2,
      })
    ).resolves.toEqual({
      campaign_id: "campaign-1",
      goal_id: "goal-1",
      position: 2,
    });

    expect(calls).toContainEqual(
      expect.objectContaining({
        table: "roadmap_items",
        action: "delete",
        filters: expect.arrayContaining([
          { method: "eq", column: "user_id", value: "user-1" },
          { method: "eq", column: "item_type", value: "GOAL" },
          { method: "eq", column: "goal_id", value: "goal-1" },
          { method: "in", column: "roadmap_id", value: ["roadmap-1"] },
        ]),
      })
    );
    expect(client.rpc).toHaveBeenCalledWith("recalculate_goal_global_rank");
  });

  it("prevents standalone roadmap goal items for goals already nested in that roadmap campaign", async () => {
    const { calls, client } = createRoadmapMutationMock({
      nestedCampaignGoalRows: [{ campaign_id: "campaign-1" }],
    });
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);

    await expect(
      addGoalToRoadmapItems("user-1", {
        roadmapId: "roadmap-1",
        goalId: "goal-1",
        position: 1,
      })
    ).rejects.toThrow("Goal already belongs to a Campaign in this Roadmap");

    expect(
      calls.some(
        (call) => call.table === "roadmap_items" && call.action === "insert"
      )
    ).toBe(false);
  });
});
