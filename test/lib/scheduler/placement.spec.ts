import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

vi.mock("../../../src/lib/scheduler/instanceRepo", () => ({
  fetchInstancesForRange: vi.fn(async () => ({
    data: [],
    error: null,
    count: null,
    status: 200,
    statusText: "OK",
  })),
  createInstance: vi.fn(async (input: unknown) => ({
    data: input,
    error: null,
    count: null,
    status: 201,
    statusText: "Created",
  })),
  rescheduleInstance: vi.fn(),
}));

let placeItemInWindows: (typeof import("../../../src/lib/scheduler/placement"))[
  "placeItemInWindows"
];
let instanceRepo: typeof import("../../../src/lib/scheduler/instanceRepo");

beforeAll(async () => {
  ({ placeItemInWindows } = await import("../../../src/lib/scheduler/placement"));
  instanceRepo = await import("../../../src/lib/scheduler/instanceRepo");
});

describe("placeItemInWindows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts a placement at the provided available start time", async () => {
    const createInstanceMock = instanceRepo.createInstance as unknown as vi.Mock;

    let capturedStartUTC: string | null = null;
    createInstanceMock.mockImplementation(async (input: { startUTC: string }) => {
      capturedStartUTC = input.startUTC;
      return {
        data: { id: "inst-1" },
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      };
    });

    const windowStart = new Date("2024-01-02T09:00:00Z");
    const availableStart = new Date("2024-01-02T10:30:00Z");
    const windowEnd = new Date("2024-01-02T13:00:00Z");

    await placeItemInWindows({
      userId: "user-1",
      item: {
        id: "proj-1",
        sourceType: "PROJECT",
        duration_min: 60,
        energy: "MEDIUM",
        weight: 1,
      },
      windows: [
        {
          id: "win-1",
          startLocal: windowStart,
          availableStartLocal: availableStart,
          endLocal: windowEnd,
        },
      ],
      date: windowStart,
    });

    expect(capturedStartUTC).toBe(availableStart.toISOString());
  });
});

