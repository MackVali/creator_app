import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  findMissingMonumentRoadmapGoalIds,
  findRedundantStandaloneRoadmapItemIds,
  findRoadmapCampaignGoalIds,
} from "../../lib/queries/roadmap-reconciliation";
import {
  ensureAreaGoalsInTrueRoadmap,
  ensureMonumentGoalsInTrueRoadmap,
  addGoalToCampaign,
  addGoalToRoadmapItems,
} from "../../lib/queries/roadmaps";
import { getSupabaseBrowser } from "../../lib/supabase";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
  order: (column: string, options?: unknown) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
  single: () => Promise<QueryResult>;
  maybeSingle: () => Promise<QueryResult>;
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
        order: () => builder,
        limit: () => builder,
        single: () => Promise.resolve(resolve(call)),
        maybeSingle: () => Promise.resolve(resolve(call)),
        then: (onFulfilled, onRejected) =>
          Promise.resolve(resolve(call)).then(onFulfilled, onRejected),
      };

      return builder;
    }),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  };

  return { calls, client };
}

type TrueRoadmapMockOptions = {
  roadmapId?: string | null;
  createdRoadmapId?: string;
  areaLabel?: string;
  goalRows?: Array<{ id: string; created_at?: string | null }>;
  roadmapItemRows?: Array<{
    id: string;
    roadmap_id?: string;
    item_type: string;
    campaign_id?: string | null;
    goal_id?: string | null;
    position?: number | null;
  }>;
  campaignGoalRows?: Array<{
    campaign_id?: string | null;
    goal_id?: string | null;
  }>;
};

function createTrueRoadmapReconciliationMock(
  options: TrueRoadmapMockOptions = {}
) {
  const calls: QueryCall[] = [];

  const resolve = (call: QueryCall): QueryResult => {
    calls.push({
      ...call,
      filters: call.filters.map((filter) => ({ ...filter })),
    });

    if (call.table === "roadmaps" && call.action === "insert") {
      return {
        data: { id: options.createdRoadmapId ?? "roadmap-area-created" },
        error: null,
      };
    }

    if (call.table === "roadmaps") {
      return {
        data: options.roadmapId === null
          ? null
          : { id: options.roadmapId ?? "roadmap-area-1" },
        error: null,
      };
    }

    if (call.table === "goals") {
      return { data: options.goalRows ?? [], error: null };
    }

    if (call.table === "areas") {
      return { data: { label: options.areaLabel ?? "Body" }, error: null };
    }

    if (call.table === "roadmap_items" && call.action === "select") {
      return { data: options.roadmapItemRows ?? [], error: null };
    }

    if (call.table === "campaign_goals") {
      return { data: options.campaignGoalRows ?? [], error: null };
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
        order: () => builder,
        limit: () => builder,
        single: () => Promise.resolve(resolve(call)),
        maybeSingle: () => Promise.resolve(resolve(call)),
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

describe("true roadmap reconciliation by owner", () => {
  it("adds a direct Area goal to the Area roadmap", async () => {
    const { calls, client } = createTrueRoadmapReconciliationMock({
      goalRows: [{ id: "area-goal-1", created_at: "2026-01-01" }],
    });
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);

    await expect(
      ensureAreaGoalsInTrueRoadmap("user-1", "area-1")
    ).resolves.toEqual({ roadmapId: "roadmap-area-1", insertedCount: 1 });

    expect(calls).toContainEqual(
      expect.objectContaining({
        table: "goals",
        action: "select",
        filters: expect.arrayContaining([
          { method: "eq", column: "user_id", value: "user-1" },
          { method: "eq", column: "area_id", value: "area-1" },
        ]),
      })
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        table: "roadmap_items",
        action: "insert",
        payload: [
          {
            user_id: "user-1",
            roadmap_id: "roadmap-area-1",
            item_type: "GOAL",
            campaign_id: null,
            goal_id: "area-goal-1",
            position: 1,
          },
        ],
      })
    );
  });

  it("creates a canonical Area roadmap row when one does not exist", async () => {
    const { calls, client } = createTrueRoadmapReconciliationMock({
      roadmapId: null,
      createdRoadmapId: "roadmap-area-created",
      areaLabel: "Mind",
      goalRows: [{ id: "area-goal-1", created_at: "2026-01-01" }],
    });
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);

    await expect(
      ensureAreaGoalsInTrueRoadmap("user-1", "mind")
    ).resolves.toEqual({
      roadmapId: "roadmap-area-created",
      insertedCount: 1,
    });

    expect(calls).toContainEqual(
      expect.objectContaining({
        table: "roadmaps",
        action: "insert",
        payload: {
          user_id: "user-1",
          title: "Mind Roadmap",
          emoji: null,
          area_id: "mind",
        },
      })
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        table: "roadmap_items",
        action: "insert",
        payload: [
          expect.objectContaining({
            roadmap_id: "roadmap-area-created",
            goal_id: "area-goal-1",
          }),
        ],
      })
    );
  });

  it("does not pull Monument-owned goals into an Area roadmap by ancestry", async () => {
    const { calls, client } = createTrueRoadmapReconciliationMock({
      goalRows: [{ id: "direct-area-goal", created_at: "2026-01-01" }],
    });
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);

    await ensureAreaGoalsInTrueRoadmap("user-1", "area-1");

    const goalSelect = calls.find(
      (call) => call.table === "goals" && call.action === "select"
    );
    expect(goalSelect?.filters).toEqual(
      expect.arrayContaining([
        { method: "eq", column: "user_id", value: "user-1" },
        { method: "eq", column: "area_id", value: "area-1" },
      ])
    );
    expect(goalSelect?.filters).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ column: "monument_id" }),
      ])
    );
    const insertCall = calls.find(
      (call) => call.table === "roadmap_items" && call.action === "insert"
    );
    expect(insertCall?.payload).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ goal_id: "monument-goal-1" }),
      ])
    );
  });

  it("does not duplicate an existing Area roadmap goal item", async () => {
    const { calls, client } = createTrueRoadmapReconciliationMock({
      goalRows: [{ id: "area-goal-1", created_at: "2026-01-01" }],
      roadmapItemRows: [
        {
          id: "item-1",
          roadmap_id: "roadmap-area-1",
          item_type: "GOAL",
          goal_id: "area-goal-1",
          position: 5,
        },
      ],
    });
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);

    await expect(
      ensureAreaGoalsInTrueRoadmap("user-1", "area-1")
    ).resolves.toEqual({ roadmapId: "roadmap-area-1", insertedCount: 0 });

    expect(
      calls.some(
        (call) => call.table === "roadmap_items" && call.action === "insert"
      )
    ).toBe(false);
  });

  it("does not add an Area Campaign child goal as standalone", async () => {
    const { calls, client } = createTrueRoadmapReconciliationMock({
      goalRows: [{ id: "area-goal-1", created_at: "2026-01-01" }],
      roadmapItemRows: [
        {
          id: "campaign-item-1",
          roadmap_id: "roadmap-area-1",
          item_type: "CAMPAIGN",
          campaign_id: "campaign-1",
          position: 3,
        },
      ],
      campaignGoalRows: [
        { campaign_id: "campaign-1", goal_id: "area-goal-1" },
      ],
    });
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);

    await expect(
      ensureAreaGoalsInTrueRoadmap("user-1", "area-1")
    ).resolves.toEqual({ roadmapId: "roadmap-area-1", insertedCount: 0 });

    expect(
      calls.some(
        (call) => call.table === "roadmap_items" && call.action === "insert"
      )
    ).toBe(false);
  });

  it("keeps Monument roadmap reconciliation on the existing RPC path", async () => {
    const { client } = createTrueRoadmapReconciliationMock();
    client.rpc.mockResolvedValueOnce({
      data: [{ roadmap_id: "roadmap-monument-1", inserted_count: 2 }],
      error: null,
    });
    vi.mocked(getSupabaseBrowser).mockReturnValue(client as never);

    await expect(
      ensureMonumentGoalsInTrueRoadmap("user-1", "monument-1")
    ).resolves.toEqual({
      roadmapId: "roadmap-monument-1",
      insertedCount: 2,
    });

    expect(client.rpc).toHaveBeenCalledWith(
      "ensure_monument_true_roadmap_items",
      { p_monument_id: "monument-1" }
    );
  });
});

describe("Area roadmap UI wiring", () => {
  it("uses the shared MonumentGoalsList roadmap surface", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/areas/AreaDetail.tsx"),
      "utf8"
    );

    expect(source).toContain("<MonumentGoalsList");
    expect(source).toContain('sourceType="area"');
    expect(source).toContain("sourceId={area.id}");
    expect(source).toContain("monumentView={areaView}");
    expect(source).not.toContain("AreaRoadmap");
  });
});
