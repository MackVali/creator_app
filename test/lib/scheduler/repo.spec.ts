import { describe, it, expect, vi } from "vitest";

import {
  buildWindowsForDateFromDayTypeBlocks,
  fetchGoalsForUser,
  fetchWindowsForDate,
  type WindowLite,
} from "../../../src/lib/scheduler/repo";
import * as repoModule from "../../../src/lib/scheduler/repo";

type WindowQueryBuilder = {
  contains: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
};

describe("fetchWindowsForDate", () => {
  it("includes recurring windows without day restrictions and their prior-day carryover", async () => {
    const date = new Date("2024-01-02T00:00:00Z");
    const weekday = date.getDay();
    const prevWeekday = (weekday + 6) % 7;

    const todayWindows: WindowLite[] = [
      {
        id: "win-today",
        label: "Today only",
        energy: "NO",
        start_local: "10:00",
        end_local: "12:00",
        days: [weekday],
      },
    ];

    const prevWindows: WindowLite[] = [
      {
        id: "win-prev-cross",
        label: "Yesterday overnight",
        energy: "NO",
        start_local: "23:00",
        end_local: "01:00",
        days: [prevWeekday],
      },
    ];

    const recurringWindows: WindowLite[] = [
      {
        id: "win-recurring",
        label: "Every day",
        energy: "NO",
        start_local: "08:00",
        end_local: "09:00",
        days: null,
      },
      {
        id: "win-recurring-cross",
        label: "Every night",
        energy: "NO",
        start_local: "22:00",
        end_local: "02:00",
        days: null,
      },
    ];

    const containsResponses = new Map<string, WindowLite[]>([
      [JSON.stringify([weekday]), todayWindows],
      [JSON.stringify([prevWeekday]), prevWindows],
    ]);

    const select = vi.fn(() => {
      const builder: WindowQueryBuilder = {
        contains: vi.fn(async (_column: string, value: number[]) => {
          const key = JSON.stringify(value);
          const data = containsResponses.get(key) ?? [];
          return { data, error: null } as const;
        }),
        is: vi.fn(async (_column: string, value: number[] | null) => {
          if (value === null) {
            return { data: recurringWindows, error: null } as const;
          }
          return { data: [], error: null } as const;
        }),
      };
      builder.eq = vi.fn(() => builder);
      return builder;
    });

    const client = {
      from: vi.fn(() => ({ select })),
    } as const;

    const windows = await fetchWindowsForDate(date, client as never, 'UTC');

    expect(windows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "win-recurring" }),
        expect.objectContaining({ id: "win-recurring-cross" }),
        expect.objectContaining({ id: "win-recurring-cross", fromPrevDay: true }),
      ]),
    );

    const carryover = windows.filter(win => win.fromPrevDay);
    expect(carryover).toHaveLength(1);
    expect(carryover.map(win => win.id)).toEqual(["win-recurring-cross"]);

    const recurringAppearances = windows.filter(win => win.id === "win-recurring-cross");
    expect(recurringAppearances.some(win => win.fromPrevDay === true)).toBe(true);
    expect(recurringAppearances.some(win => !win.fromPrevDay)).toBe(true);
  });

  it("derives the weekday using the provided timezone", async () => {
    const date = new Date("2024-01-01T11:00:00Z");
    const containsMock = vi.fn(async (_column: string, value: number[]) => ({
      data: [],
      error: null,
    } as const));
    const isMock = vi.fn(async () => ({ data: [], error: null } as const));
    const select = vi.fn(() => {
      const builder: WindowQueryBuilder = {
        contains: containsMock,
        is: isMock,
        eq: vi.fn(() => builder),
      };
      return builder;
    });
    const client = { from: vi.fn(() => ({ select })) } as const;

    await fetchWindowsForDate(date, client as never, "Pacific/Auckland");

    expect(containsMock).toHaveBeenCalledWith("days", [2]);
    expect(containsMock).toHaveBeenCalledWith("days", [1]);
    expect(isMock).toHaveBeenCalledWith("days", null);
  });

  it("does not throw when parity compares signatures", async () => {
    const date = new Date("2024-01-02T00:00:00Z");
    const weekday = date.getDay();

    const legacyWindows: WindowLite[] = [
      {
        id: "win-1",
        label: "Legacy Window",
        energy: "NO",
        start_local: "09:00",
        end_local: "10:00",
        days: [weekday],
      },
    ];

    const select = vi.fn(() => {
      const builder: WindowQueryBuilder = {
        contains: vi.fn(async (_column: string, value: number[]) => {
          const isToday = value.length === 1 && value[0] === weekday;
          return { data: isToday ? legacyWindows : [], error: null } as const;
        }),
        is: vi.fn(async () => ({ data: [], error: null } as const)),
      };
      builder.eq = vi.fn(() => builder);
      return builder;
    });

    const client = { from: vi.fn(() => ({ select })) } as const;

    const v2Spy = vi
      .spyOn(repoModule, "getWindowsForDate_v2")
      .mockResolvedValue([
        {
          id: "win-1",
          label: "V2 Window",
          energy: "NO",
          start_local: "09:00",
          end_local: "10:00",
          days: [weekday],
        },
      ]);

    await expect(
      fetchWindowsForDate(date, client as never, "UTC", {
        userId: "user-1",
        useDayTypes: true,
        parity: { enabled: true },
      })
    ).resolves.toBeDefined();

    v2Spy.mockRestore();
  });
});

describe("fetchGoalsForUser", () => {
  function createTableMockClient(tables: Record<string, unknown[]>) {
    type TableMockResult = { data: unknown[]; error: null };
    type TableMockBuilder = {
      select: () => TableMockBuilder;
      eq: () => TableMockBuilder;
      in: () => TableMockBuilder;
      not: () => TableMockBuilder;
      order: () => TableMockBuilder;
      then: <TResult1 = TableMockResult, TResult2 = never>(
        onFulfilled?:
          | ((value: TableMockResult) => TResult1 | PromiseLike<TResult1>)
          | null,
        onRejected?:
          | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
          | null
      ) => Promise<TResult1 | TResult2>;
    };

    return {
      from: vi.fn((table: string) => {
        const result: TableMockResult = {
          data: tables[table] ?? [],
          error: null,
        };
        const builder: TableMockBuilder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          in: vi.fn(() => builder),
          not: vi.fn(() => builder),
          order: vi.fn(() => builder),
          then: (onFulfilled, onRejected) =>
            Promise.resolve(result).then(onFulfilled, onRejected),
        };
        return builder;
      }),
    };
  }

  it("derives active goal priority from visible monument roadmap order", async () => {
    const client = createTableMockClient({
      goals: [
        {
          id: "goal-standalone",
          name: "Standalone",
          status: "ACTIVE",
          active: true,
          priority_rank: 9,
          global_rank: null,
          monument_id: "mon-1",
        },
        {
          id: "goal-campaign",
          name: "Campaign Goal",
          status: "ACTIVE",
          active: true,
          priority_rank: 7,
          global_rank: null,
          monument_id: "mon-1",
        },
        {
          id: "goal-duplicate",
          name: "Duplicate",
          status: "ACTIVE",
          active: true,
          priority_rank: 1,
          global_rank: null,
          monument_id: "mon-1",
        },
        {
          id: "goal-paused",
          name: "Paused",
          status: "PAUSED",
          active: false,
          priority_rank: 2,
          global_rank: null,
          monument_id: "mon-1",
        },
        {
          id: "goal-second-roadmap",
          name: "Second Roadmap",
          status: "ACTIVE",
          active: true,
          priority_rank: 3,
          global_rank: null,
          monument_id: "mon-1",
        },
        {
          id: "goal-no-roadmap",
          name: "Legacy Fallback",
          status: "ACTIVE",
          active: true,
          priority_rank: 6,
          global_rank: null,
          monument_id: "mon-1",
        },
      ],
      roadmaps: [
        {
          id: "roadmap-later",
          monument_id: "mon-1",
          created_at: "2024-01-02T00:00:00Z",
        },
        {
          id: "roadmap-earlier",
          monument_id: "mon-1",
          created_at: "2024-01-01T00:00:00Z",
        },
      ],
      roadmap_items: [
        {
          id: "item-second-roadmap",
          roadmap_id: "roadmap-later",
          item_type: "GOAL",
          goal_id: "goal-second-roadmap",
          position: 1,
        },
        {
          id: "item-duplicate-late",
          roadmap_id: "roadmap-earlier",
          item_type: "GOAL",
          goal_id: "goal-duplicate",
          position: 3,
        },
        {
          id: "item-campaign",
          roadmap_id: "roadmap-earlier",
          item_type: "CAMPAIGN",
          campaign_id: "campaign-1",
          position: 2,
        },
        {
          id: "item-standalone",
          roadmap_id: "roadmap-earlier",
          item_type: "GOAL",
          goal_id: "goal-standalone",
          position: 1,
        },
      ],
      campaign_goals: [
        {
          id: "campaign-goal-duplicate",
          campaign_id: "campaign-1",
          goal_id: "goal-duplicate",
          position: 3,
        },
        {
          id: "campaign-goal-paused",
          campaign_id: "campaign-1",
          goal_id: "goal-paused",
          position: 1,
        },
        {
          id: "campaign-goal-active",
          campaign_id: "campaign-1",
          goal_id: "goal-campaign",
          position: 2,
        },
      ],
    });

    const goals = await fetchGoalsForUser("user-1", client as never);
    const priorityById = new Map(
      goals.map((goal) => [goal.id, goal.priorityRank])
    );

    expect(priorityById.get("goal-standalone")).toBe(1);
    expect(priorityById.get("goal-campaign")).toBe(2);
    expect(priorityById.get("goal-duplicate")).toBe(3);
    expect(priorityById.get("goal-second-roadmap")).toBe(4);
    expect(priorityById.get("goal-no-roadmap")).toBe(6);
    expect(priorityById.get("goal-paused")).toBe(2);
  });

  it("ignores duplicate standalone roadmap items when the goal is inside a campaign in the same roadmap", async () => {
    const client = createTableMockClient({
      goals: [
        {
          id: "doctor-visit",
          name: "Doctor Visit",
          status: "ACTIVE",
          active: true,
          priority_rank: null,
          global_rank: null,
          monument_id: "life",
        },
        {
          id: "fix-license",
          name: "Fix License",
          status: "ACTIVE",
          active: true,
          priority_rank: null,
          global_rank: null,
          monument_id: "life",
        },
        {
          id: "standalone-after",
          name: "Standalone After",
          status: "ACTIVE",
          active: true,
          priority_rank: null,
          global_rank: null,
          monument_id: "life",
        },
      ],
      roadmaps: [
        {
          id: "life-roadmap",
          monument_id: "life",
          created_at: "2024-01-01T00:00:00Z",
        },
      ],
      roadmap_items: [
        {
          id: "duplicate-standalone",
          roadmap_id: "life-roadmap",
          item_type: "GOAL",
          goal_id: "fix-license",
          position: 1,
        },
        {
          id: "life-campaign-item",
          roadmap_id: "life-roadmap",
          item_type: "CAMPAIGN",
          campaign_id: "my-life",
          position: 2,
        },
        {
          id: "standalone-item",
          roadmap_id: "life-roadmap",
          item_type: "GOAL",
          goal_id: "standalone-after",
          position: 3,
        },
      ],
      campaign_goals: [
        {
          id: "campaign-doctor",
          campaign_id: "my-life",
          goal_id: "doctor-visit",
          position: 1,
        },
        {
          id: "campaign-license",
          campaign_id: "my-life",
          goal_id: "fix-license",
          position: 2,
        },
      ],
    });

    const goals = await fetchGoalsForUser("user-1", client as never);
    const priorityById = new Map(
      goals.map((goal) => [goal.id, goal.priorityRank])
    );

    expect(priorityById.get("doctor-visit")).toBe(1);
    expect(priorityById.get("fix-license")).toBe(2);
    expect(priorityById.get("standalone-after")).toBe(3);
  });
});

describe("buildWindowsForDateFromDayTypeBlocks (v2 parity)", () => {
  const baseWindow = (
    overrides: Partial<WindowLite> & Pick<WindowLite, "id">
  ): WindowLite => ({
    id: overrides.id,
    label: overrides.label ?? "",
    energy: overrides.energy ?? "NO",
    start_local: overrides.start_local ?? "00:00",
    end_local: overrides.end_local ?? "00:00",
    days: overrides.days ?? null,
    location_context_id: overrides.location_context_id ?? null,
    location_context_value: overrides.location_context_value ?? null,
    location_context_name: overrides.location_context_name ?? null,
    window_kind: overrides.window_kind ?? "DEFAULT",
  });

  it("filters by weekday and includes always-on blocks", () => {
    const monday = new Date("2024-01-01T00:00:00Z"); // Monday
    const tuesday = new Date("2024-01-02T00:00:00Z");
    const windows: WindowLite[] = [
      baseWindow({
        id: "mon-only",
        start_local: "08:00",
        end_local: "09:00",
        days: [1],
      }),
      baseWindow({
        id: "always",
        start_local: "10:00",
        end_local: "11:00",
        days: null,
      }),
    ];

    const mondayResult = buildWindowsForDateFromDayTypeBlocks(
      windows,
      monday,
      "UTC"
    );
    const tuesdayResult = buildWindowsForDateFromDayTypeBlocks(
      windows,
      tuesday,
      "UTC"
    );

    expect(mondayResult.map((w) => w.id)).toEqual(["mon-only", "always"]);
    expect(tuesdayResult.map((w) => w.id)).toEqual(["always"]);
  });

  it("adds cross-midnight tails from the previous day", () => {
    const tuesday = new Date("2024-01-02T00:00:00Z");
    const windows: WindowLite[] = [
      baseWindow({
        id: "overnight",
        start_local: "22:00",
        end_local: "02:00",
        days: [1],
      }),
    ];

    const result = buildWindowsForDateFromDayTypeBlocks(
      windows,
      tuesday,
      "UTC"
    );

    const carry = result.find((w) => w.fromPrevDay);
    expect(carry).toBeDefined();
    expect(carry?.id).toBe("overnight");
    expect(carry?.fromPrevDay).toBe(true);
  });

  it("drops overlapping prev-day tails to match legacy dedupe", () => {
    const tuesday = new Date("2024-01-02T00:00:00Z");
    const windows: WindowLite[] = [
      baseWindow({
        id: "overnight",
        start_local: "23:00",
        end_local: "02:00",
        days: [1],
      }),
      baseWindow({
        id: "morning",
        start_local: "01:00",
        end_local: "03:00",
        days: [2],
      }),
    ];

    const result = buildWindowsForDateFromDayTypeBlocks(
      windows,
      tuesday,
      "UTC"
    );

    expect(result.some((w) => w.id === "morning")).toBe(true);
    expect(result.some((w) => w.id === "overnight" && w.fromPrevDay)).toBe(
      false
    );
  });

  it("returns deterministic ordering (start_local then id)", () => {
    const monday = new Date("2024-01-01T00:00:00Z");
    const windows: WindowLite[] = [
      baseWindow({
        id: "z-two",
        start_local: "09:00",
        end_local: "10:00",
        days: [1],
      }),
      baseWindow({
        id: "a-one",
        start_local: "08:00",
        end_local: "09:00",
        days: [1],
      }),
      baseWindow({
        id: "y-overnight",
        start_local: "22:00",
        end_local: "01:00",
        days: [0],
      }),
    ];

    const result = buildWindowsForDateFromDayTypeBlocks(
      windows,
      monday,
      "UTC"
    );

    expect(result.map((w) => `${w.start_local}-${w.id}`)).toEqual([
      "08:00-a-one",
      "09:00-z-two",
      "22:00-y-overnight",
    ]);
  });
});

  it("filters window queries by user when a user id is provided", async () => {
    const eqMocks: Array<ReturnType<typeof vi.fn>> = [];
    const select = vi.fn(() => {
      const builder: WindowQueryBuilder = {
        contains: vi.fn(async () => ({ data: [], error: null } as const)),
        is: vi.fn(async () => ({ data: [], error: null } as const)),
        eq: vi.fn(() => builder),
      };
      eqMocks.push(builder.eq);
      return builder;
    });
    const client = { from: vi.fn(() => ({ select })) } as const;

    await fetchWindowsForDate(new Date("2024-01-01T00:00:00Z"), client as never, "UTC", {
      userId: "user-123",
    });

    expect(eqMocks).toHaveLength(3);
    for (const eq of eqMocks) {
      expect(eq).toHaveBeenCalledWith("user_id", "user-123");
    }
  });
