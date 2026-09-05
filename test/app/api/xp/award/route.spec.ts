import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const createSupabaseServerClientMock = vi.hoisted(() => vi.fn());
const ensureCompletionEventMock = vi.hoisted(() => vi.fn());
const resolveNextReversibleAwardKeyBaseMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

vi.mock("@/lib/completions/completionEvents", async () => {
  const actual = await vi.importActual<typeof import("@/lib/completions/completionEvents")>(
    "@/lib/completions/completionEvents"
  );
  return {
    ...actual,
    ensureCompletionEvent: ensureCompletionEventMock,
  };
});

vi.mock("@/lib/xp/reversibleXpAwards", () => ({
  resolveNextReversibleAwardKeyBase: resolveNextReversibleAwardKeyBaseMock,
}));

import { POST } from "@/app/api/xp/award/route";

type Row = Record<string, unknown>;
type Filter =
  | { type: "eq"; column: string; value: unknown }
  | { type: "in"; column: string; values: unknown[] }
  | { type: "is"; column: string; value: unknown };

type MockDbState = {
  rows: Record<string, Row[]>;
  insertedXpEvents: Row[];
};

function applyFilters(rows: Row[], filters: Filter[]) {
  return rows.filter((row) =>
    filters.every((filter) => {
      if (filter.type === "eq") return row[filter.column] === filter.value;
      if (filter.type === "in") return filter.values.includes(row[filter.column]);
      return row[filter.column] === filter.value;
    })
  );
}

function projectRows(rows: Row[], columns: string | null) {
  if (!columns || columns === "*") return rows;
  const names = columns.split(",").map((column) => column.trim());
  return rows.map((row) =>
    Object.fromEntries(names.map((name) => [name, row[name]]))
  );
}

function createQuery(state: MockDbState, table: string) {
  const filters: Filter[] = [];
  let operation: "select" | "insert" | "update" = "select";
  let selectedColumns: string | null = null;
  let mutationPayload: Row | Row[] | null = null;

  const resolve = (single: boolean) => {
    if (operation === "insert") {
      const inserted = Array.isArray(mutationPayload)
        ? mutationPayload
        : mutationPayload
          ? [mutationPayload]
          : [];
      if (table === "xp_events") {
        state.insertedXpEvents.push(...inserted);
      }
      return {
        data: projectRows(
          inserted.map((row, index) => ({ id: `inserted-${index + 1}`, ...row })),
          selectedColumns
        ),
        error: null,
      };
    }

    if (operation === "update") {
      return { data: null, error: null };
    }

    const rows = projectRows(applyFilters(state.rows[table] ?? [], filters), selectedColumns);
    return { data: single ? rows[0] ?? null : rows, error: null };
  };

  const query = {
    select(columns = "*") {
      selectedColumns = columns;
      return query;
    },
    insert(payload: Row | Row[]) {
      operation = "insert";
      mutationPayload = payload;
      return query;
    },
    update(payload: Row) {
      operation = "update";
      mutationPayload = payload;
      return query;
    },
    eq(column: string, value: unknown) {
      filters.push({ type: "eq", column, value });
      return query;
    },
    in(column: string, values: unknown[]) {
      filters.push({ type: "in", column, values });
      return query;
    },
    is(column: string, value: unknown) {
      filters.push({ type: "is", column, value });
      return query;
    },
    maybeSingle() {
      return Promise.resolve(resolve(true));
    },
    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return Promise.resolve(resolve(false)).then(onfulfilled, onrejected);
    },
  };

  return query;
}

function createClient(rows: MockDbState["rows"] = {}) {
  const state: MockDbState = {
    rows: {
      xp_events: [],
      skill_progress: [],
      schedule_instances: [],
      skills: [],
      area_skills: [],
      monuments: [],
      ...rows,
    },
    insertedXpEvents: [],
  };

  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "user-1" } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => createQuery(state, table)),
  };

  return { client, state };
}

async function award(body: Row) {
  const request = new Request("http://localhost/api/xp/award", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return POST(request as NextRequest);
}

function awardKeys(events: Row[]) {
  return events.map((event) => event.award_key);
}

describe("POST /api/xp/award Area attribution", () => {
  beforeEach(() => {
    createSupabaseServerClientMock.mockReset();
    ensureCompletionEventMock.mockReset();
    ensureCompletionEventMock.mockResolvedValue({ id: null, completionKey: null });
    resolveNextReversibleAwardKeyBaseMock.mockReset();
    resolveNextReversibleAwardKeyBaseMock.mockResolvedValue({
      awardKeyBase: "rev:1",
      activePositiveCount: 0,
      alreadyReversedCount: 0,
      blockedByActivePositive: false,
    });
  });

  it("preserves explicit Area IDs", async () => {
    const { client, state } = createClient();
    createSupabaseServerClientMock.mockResolvedValue(client);

    const response = await award({
      kind: "task",
      awardKeyBase: "task:1",
      areaIds: ["area-explicit"],
    });

    expect(response.status).toBe(200);
    expect(awardKeys(state.insertedXpEvents)).toEqual(["task:1:area:area-explicit"]);
  });

  it("derives Area XP from user-scoped Skill relationships", async () => {
    const { client, state } = createClient({
      skills: [{ id: "skill-1", user_id: "user-1", name: "Writing", icon: null }],
      area_skills: [
        { user_id: "user-1", skill_id: "skill-1", area_id: "area-skill" },
      ],
    });
    createSupabaseServerClientMock.mockResolvedValue(client);

    await award({ kind: "task", awardKeyBase: "task:skill", skillIds: ["skill-1"] });

    expect(awardKeys(state.insertedXpEvents)).toContain("task:skill:area:area-skill");
  });

  it("derives Area XP from user-scoped Monument ownership", async () => {
    const { client, state } = createClient({
      monuments: [{ id: "mon-1", user_id: "user-1", area_id: "area-mon" }],
    });
    createSupabaseServerClientMock.mockResolvedValue(client);

    await award({ kind: "project", awardKeyBase: "project:mon", monumentIds: ["mon-1"] });

    expect(awardKeys(state.insertedXpEvents)).toContain("project:mon:area:area-mon");
  });

  it("deduplicates Skill, Monument, and explicit Area IDs while preserving Skill and Monument XP rows", async () => {
    const { client, state } = createClient({
      skills: [{ id: "skill-1", user_id: "user-1", name: "Writing", icon: null }],
      area_skills: [
        { user_id: "user-1", skill_id: "skill-1", area_id: "area-shared" },
      ],
      monuments: [{ id: "mon-1", user_id: "user-1", area_id: "area-shared" }],
    });
    createSupabaseServerClientMock.mockResolvedValue(client);

    await award({
      kind: "goal",
      awardKeyBase: "goal:shared",
      skillIds: ["skill-1"],
      monumentIds: ["mon-1"],
      areaIds: ["area-shared"],
    });

    expect(awardKeys(state.insertedXpEvents)).toEqual([
      "goal:shared:skill:skill-1",
      "goal:shared:mon:mon-1",
      "goal:shared:area:area-shared",
    ]);
  });

  it("does not derive Area IDs from unowned Skill or Monument relationships", async () => {
    const { client, state } = createClient({
      area_skills: [
        { user_id: "other-user", skill_id: "skill-1", area_id: "area-unowned-skill" },
      ],
      monuments: [
        { id: "mon-1", user_id: "other-user", area_id: "area-unowned-mon" },
      ],
    });
    createSupabaseServerClientMock.mockResolvedValue(client);

    await award({
      kind: "project",
      awardKeyBase: "project:unowned",
      skillIds: ["skill-1"],
      monumentIds: ["mon-1"],
    });

    expect(awardKeys(state.insertedXpEvents)).toEqual([
      "project:unowned:skill:skill-1",
      "project:unowned:mon:mon-1",
    ]);
  });

  it("keeps existing Skill and Monument XP rows when adding derived Area XP", async () => {
    const { client, state } = createClient({
      skills: [{ id: "skill-1", user_id: "user-1", name: "Writing", icon: null }],
      area_skills: [
        { user_id: "user-1", skill_id: "skill-1", area_id: "area-skill" },
      ],
      monuments: [{ id: "mon-1", user_id: "user-1", area_id: "area-mon" }],
    });
    createSupabaseServerClientMock.mockResolvedValue(client);

    await award({
      kind: "project",
      awardKeyBase: "project:all",
      skillIds: ["skill-1"],
      monumentIds: ["mon-1"],
    });

    expect(awardKeys(state.insertedXpEvents)).toEqual([
      "project:all:skill:skill-1",
      "project:all:mon:mon-1",
      "project:all:area:area-skill",
      "project:all:area:area-mon",
    ]);
  });

  it("resolves Area attribution for reversible undo-shaped awards", async () => {
    const { client, state } = createClient({
      area_skills: [
        { user_id: "user-1", skill_id: "skill-1", area_id: "area-undo" },
      ],
    });
    createSupabaseServerClientMock.mockResolvedValue(client);

    await award({
      kind: "task",
      amount: -1,
      awardKeyBase: "task:undo",
      skillIds: ["skill-1"],
      reversible: { occurrenceStem: "task:undo" },
    });

    expect(awardKeys(state.insertedXpEvents)).toContain("task:undo:area:area-undo");
    expect(state.insertedXpEvents.find((event) => event.area_id === "area-undo")).toMatchObject({
      amount: -1,
    });
  });
});
