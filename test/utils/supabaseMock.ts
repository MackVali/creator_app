import { vi } from "vitest";

type SupabaseMockOptions = {
  skills?: Array<{ id: string; monument_id: string | null }>;
};

type UpdateCall = {
  id: string | null;
  payload: Record<string, unknown> | null;
};

type SupabaseMockClient = {
  from: (table: string) => unknown;
};

type SupabaseMockResult = {
  client: SupabaseMockClient;
  update: ReturnType<typeof vi.fn>;
  canceledIds: string[];
  updateCalls: UpdateCall[];
};

export const createSupabaseMock = (
  options?: SupabaseMockOptions
): SupabaseMockResult => {
  let lastEqValue: string | null = null;
  let lastUpdatePayload: Record<string, unknown> | null = null;
  const updateCalls: UpdateCall[] = [];
  const canceledIds: string[] = [];
  const skillsResponse = {
    data: options?.skills ?? [],
    error: null,
    count: null,
    status: 200,
    statusText: "OK",
  };
  const single = vi.fn(async () => ({
    data: { id: lastEqValue },
    error: null,
    count: null,
    status: 200,
    statusText: "OK",
  }));
  const buildUpdateChain = () => {
    const chain: Record<string, any> = {};
    chain.select = vi.fn(() => chain);
    chain.single = single;
    chain.lt = vi.fn(() => chain);
    chain.gt = vi.fn(() => chain);
    chain.or = vi.fn(() => chain);
    chain.eq = vi.fn((column: string, value: string) => {
      lastEqValue = value;
      if (column === "id" && lastUpdatePayload?.status === "canceled") {
        canceledIds.push(value);
      }
      if (column === "id") {
        updateCalls.push({ id: value, payload: lastUpdatePayload });
      }
      return chain;
    });
    chain.in = vi.fn((column: string, values: string[]) => {
      if (column === "id" && lastUpdatePayload?.status === "canceled") {
        for (const value of values) {
          canceledIds.push(value);
        }
      }
      if (column === "id") {
        for (const value of values) {
          updateCalls.push({ id: value, payload: lastUpdatePayload });
        }
      }
      return chain;
    });
    return chain;
  };
  const update = vi.fn((payload: Record<string, unknown>) => {
    lastUpdatePayload = payload ?? null;
    return buildUpdateChain();
  });
  const buildWindowsChain = () => {
    const response = {
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    };
    const chain: Record<string, any> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.gte = vi.fn(() => chain);
    chain.lte = vi.fn(() => chain);
    chain.lt = vi.fn(() => chain);
    chain.gt = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.contains = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);
    chain.or = vi.fn(() => chain);
    chain.then = (
      onFulfilled?: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(response).then(onFulfilled, onRejected);
    return chain;
  };
  const buildQueryChain = () => {
    const response = {
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    };
    const chain: Record<string, any> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.not = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.gte = vi.fn(() => chain);
    chain.lte = vi.fn(() => chain);
    chain.lt = vi.fn(() => chain);
    chain.gt = vi.fn(() => chain);
    chain.contains = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);
    chain.or = vi.fn(() => chain);
    chain.single = vi.fn(async () => response);
    chain.limit = vi.fn(async () => ({
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    }));
    chain.then = (
      onFulfilled?: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(response).then(onFulfilled, onRejected);
    return chain;
  };
  const buildDefaultChain = (responseOverride?: {
    data: unknown;
    error: null;
    count: null;
    status: number;
    statusText: string;
  }) => {
    const response =
      responseOverride ?? {
        data: [],
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      };
    const chain: Record<string, any> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.not = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.gte = vi.fn(() => chain);
    chain.lte = vi.fn(() => chain);
    chain.lt = vi.fn(() => chain);
    chain.gt = vi.fn(() => chain);
    chain.contains = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);
    chain.or = vi.fn(() => chain);
    chain.single = vi.fn(async () => response);
    chain.limit = vi.fn(async () => response);
    chain.then = (
      onFulfilled?: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(response).then(onFulfilled, onRejected);
    return chain;
  };
  const insert = vi.fn((input: unknown) =>
    buildDefaultChain({
      data: input ?? null,
      error: null,
      count: null,
      status: 201,
      statusText: "Created",
    })
  );
  const from = vi.fn((table: string) => {
    if (table === "skills") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(async () => skillsResponse),
        })),
      };
    }
    if (table === "schedule_instances") {
      return {
        update,
        insert,
        delete: vi.fn(() => buildQueryChain()),
        select: vi.fn(() => buildQueryChain()),
      };
    }
    if (table === "windows") {
      return {
        select: vi.fn(() => buildWindowsChain()),
      };
    }
    return {
      select: vi.fn(() => buildDefaultChain()),
      update,
      insert,
      delete: vi.fn(() => buildDefaultChain()),
    };
  });
  const client = { from } as SupabaseMockClient;
  return { client, update, canceledIds, updateCalls };
};
