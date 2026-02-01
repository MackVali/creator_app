import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type { ScheduleInstance } from "../../../src/lib/scheduler/instanceRepo";

vi.mock("../../../src/lib/scheduler/instanceRepo", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../../src/lib/scheduler/instanceRepo")
  >();
  return {
    ...actual,
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
  };
});

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

  it("never schedules before the supplied notBefore threshold", async () => {
    const createInstanceMock = instanceRepo.createInstance as unknown as vi.Mock;

    let capturedStartUTC: string | null = null;
    createInstanceMock.mockImplementation(async (input: { startUTC: string }) => {
      capturedStartUTC = input.startUTC;
        return {
          data: { id: "inst-2" },
          error: null,
          count: null,
          status: 201,
          statusText: "Created",
        };
    });

    const windowStart = new Date("2024-01-02T09:00:00Z");
    const windowEnd = new Date("2024-01-02T12:00:00Z");
    const threshold = new Date("2024-01-02T11:15:00Z");

    await placeItemInWindows({
      userId: "user-1",
      item: {
        id: "proj-1",
        sourceType: "PROJECT",
        duration_min: 30,
        energy: "MEDIUM",
        weight: 1,
      },
      windows: [
        {
          id: "win-1",
          startLocal: windowStart,
          endLocal: windowEnd,
        },
      ],
      date: windowStart,
      notBefore: threshold,
    });

    expect(capturedStartUTC).toBe(threshold.toISOString());
  });

  it("runs without a provided cache", async () => {
    const createInstanceMock = instanceRepo.createInstance as unknown as vi.Mock;
    createInstanceMock.mockResolvedValueOnce({
      data: { id: "inst-cache" },
      error: null,
      count: null,
      status: 201,
      statusText: "Created",
    });

    const windowStart = new Date("2024-01-02T08:00:00Z");
    const windowEnd = new Date("2024-01-02T09:00:00Z");

    const result = await placeItemInWindows({
      userId: "user-1",
      item: {
        id: "proj-1",
        sourceType: "PROJECT",
        duration_min: 30,
        energy: "MEDIUM",
        weight: 1,
      },
      windows: [
        {
          id: "win-1",
          startLocal: windowStart,
          endLocal: windowEnd,
        },
      ],
      date: windowStart,
    });

    expect(result).toBeDefined();
  });

  it("chooses the window whose actual opening is earliest", async () => {
    const fetchInstancesMock = instanceRepo.fetchInstancesForRange as unknown as vi.Mock;
    const createInstanceMock = instanceRepo.createInstance as unknown as vi.Mock;

    const firstWindowStart = new Date("2024-01-02T09:00:00Z");
    const firstWindowEnd = new Date("2024-01-02T17:00:00Z");
    const secondWindowStart = new Date("2024-01-02T10:00:00Z");
    const secondWindowEnd = new Date("2024-01-02T12:00:00Z");

    fetchInstancesMock.mockResolvedValueOnce({
      data: [
        {
          id: "inst-existing",
          start_utc: "2024-01-02T09:00:00Z",
          end_utc: "2024-01-02T16:00:00Z",
        },
      ],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    });

    let capturedStartUTC: string | null = null;
    createInstanceMock.mockImplementation(async (input: { startUTC: string }) => {
      capturedStartUTC = input.startUTC;
      return {
        data: { id: "inst-placed" },
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      };
    });

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
          id: "win-late-gap",
          startLocal: firstWindowStart,
          endLocal: firstWindowEnd,
        },
        {
          id: "win-early-gap",
          startLocal: secondWindowStart,
          endLocal: secondWindowEnd,
        },
      ],
      date: firstWindowStart,
    });

    expect(capturedStartUTC).toBe(new Date("2024-01-02T09:00:00Z").toISOString());
    expect(fetchInstancesMock).toHaveBeenCalledTimes(1);
  });

  it("ignores queued project blocks when instructed", async () => {
    const fetchInstancesMock = instanceRepo.fetchInstancesForRange as unknown as vi.Mock;
    const createInstanceMock = instanceRepo.createInstance as unknown as vi.Mock;

    fetchInstancesMock.mockResolvedValueOnce({
      data: [
        {
          id: "inst-other",
          source_id: "proj-other",
          source_type: "PROJECT",
          start_utc: "2024-01-02T09:00:00Z",
          end_utc: "2024-01-02T10:00:00Z",
        },
      ],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    });

    let capturedStartUTC: string | null = null;
    createInstanceMock.mockImplementation(async (input: { startUTC: string }) => {
      capturedStartUTC = input.startUTC;
      return {
        data: { id: "inst-placed" },
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      };
    });

    const windowStart = new Date("2024-01-02T09:00:00Z");
    const windowEnd = new Date("2024-01-02T11:00:00Z");

    await placeItemInWindows({
      userId: "user-1",
      item: {
        id: "proj-main",
        sourceType: "PROJECT",
        duration_min: 60,
        energy: "HIGH",
        weight: 10,
      },
      windows: [
        {
          id: "win-high",
          startLocal: windowStart,
          endLocal: windowEnd,
        },
      ],
      date: windowStart,
      ignoreProjectIds: new Set(["proj-other"]),
    });

    expect(capturedStartUTC).toBe(windowStart.toISOString());
  });

  it("advances non-SYNC habits past existing non-SYNC habit blocks", async () => {
    const createInstanceMock = instanceRepo.createInstance as unknown as vi.Mock;

    let capturedStartUTC: string | null = null;
    createInstanceMock.mockImplementation(async (input: { startUTC: string }) => {
      capturedStartUTC = input.startUTC;
      return {
        data: { id: "inst-non-sync" },
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      };
    });

    const windowStart = new Date("2024-01-02T02:00:00Z");
    const windowEnd = new Date("2024-01-02T03:00:00Z");
    const habitTypeById = new Map([["habit-blocker", "HABIT"]]);

    await placeItemInWindows({
      userId: "user-1",
      item: {
        id: "habit-next",
        sourceType: "HABIT",
        duration_min: 10,
        energy: "LOW",
        weight: 0,
      },
      windows: [
        {
          id: "win-early",
          startLocal: windowStart,
          endLocal: windowEnd,
        },
      ],
      date: windowStart,
      existingInstances: [
        {
          id: "inst-blocker",
          source_id: "habit-blocker",
          source_type: "HABIT",
          status: "scheduled",
          start_utc: "2024-01-02T02:00:00Z",
          end_utc: "2024-01-02T02:15:00Z",
        },
      ],
      habitTypeById,
    });

    expect(capturedStartUTC).toBe("2024-01-02T02:15:00.000Z");
  });

  it("lets SYNC habits overlap habits but still respects project blockers", async () => {
    const createInstanceMock = instanceRepo.createInstance as unknown as vi.Mock;

    const capturedStarts: string[] = [];
    createInstanceMock.mockImplementation(async (input: { startUTC: string }) => {
      capturedStarts.push(input.startUTC);
      return {
        data: { id: `inst-${capturedStarts.length}` },
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      };
    });

    const windowStart = new Date("2024-01-02T02:00:00Z");
    const windowEnd = new Date("2024-01-02T03:00:00Z");
    const habitTypeById = new Map([["habit-blocker", "HABIT"], ["habit-sync", "SYNC"]]);

    await placeItemInWindows({
      userId: "user-1",
      item: {
        id: "habit-sync",
        sourceType: "HABIT",
        duration_min: 10,
        energy: "LOW",
        weight: 0,
      },
      windows: [
        {
          id: "win-early",
          startLocal: windowStart,
          endLocal: windowEnd,
        },
      ],
      date: windowStart,
      existingInstances: [
        {
          id: "inst-habit",
          source_id: "habit-blocker",
          source_type: "HABIT",
          status: "scheduled",
          start_utc: "2024-01-02T02:00:00Z",
          end_utc: "2024-01-02T02:15:00Z",
        },
      ],
      allowHabitOverlap: true,
      habitTypeById,
    });

    await placeItemInWindows({
      userId: "user-1",
      item: {
        id: "habit-sync",
        sourceType: "HABIT",
        duration_min: 10,
        energy: "LOW",
        weight: 0,
      },
      windows: [
        {
          id: "win-early",
          startLocal: windowStart,
          endLocal: windowEnd,
        },
      ],
      date: windowStart,
      existingInstances: [
        {
          id: "inst-habit",
          source_id: "habit-blocker",
          source_type: "HABIT",
          status: "scheduled",
          start_utc: "2024-01-02T02:00:00Z",
          end_utc: "2024-01-02T02:15:00Z",
        },
        {
          id: "inst-project",
          source_id: "proj-1",
          source_type: "PROJECT",
          status: "scheduled",
          start_utc: "2024-01-02T02:00:00Z",
          end_utc: "2024-01-02T02:30:00Z",
        },
      ],
      allowHabitOverlap: true,
      habitTypeById,
    });

    expect(capturedStarts[0]).toBe("2024-01-02T02:00:00.000Z");
    expect(capturedStarts[1]).toBe("2024-01-02T02:30:00.000Z");
  });

  it("allows project placement overlapping SYNC habits but not non-SYNC habits", async () => {
    const createInstanceMock = instanceRepo.createInstance as unknown as vi.Mock;

    const capturedStarts: string[] = [];
    createInstanceMock.mockImplementation(async (input: { startUTC: string }) => {
      capturedStarts.push(input.startUTC);
      return {
        data: { id: `inst-${capturedStarts.length}` },
        error: null,
        count: null,
        status: 201,
        statusText: "Created",
      };
    });

    const windowStart = new Date("2024-01-02T02:00:00Z");
    const windowEnd = new Date("2024-01-02T03:00:00Z");

    const habitTypeById = new Map<string, string>([
      ["habit-sync", "SYNC"],
      ["habit-hard", "HABIT"],
    ]);

    await placeItemInWindows({
      userId: "user-1",
      item: {
        id: "project-1",
        sourceType: "PROJECT",
        duration_min: 15,
        energy: "LOW",
        weight: 0,
      },
      windows: [{ id: "win", startLocal: windowStart, endLocal: windowEnd }],
      date: windowStart,
      existingInstances: [
        {
          id: "inst-sync",
          source_id: "habit-sync",
          source_type: "HABIT",
          status: "scheduled",
          start_utc: "2024-01-02T02:00:00Z",
          end_utc: "2024-01-02T02:30:00Z",
        },
      ],
      habitTypeById,
    });

    await placeItemInWindows({
      userId: "user-1",
      item: {
        id: "project-2",
        sourceType: "PROJECT",
        duration_min: 15,
        energy: "LOW",
        weight: 0,
      },
      windows: [{ id: "win", startLocal: windowStart, endLocal: windowEnd }],
      date: windowStart,
      existingInstances: [
        {
          id: "inst-hard",
          source_id: "habit-hard",
          source_type: "HABIT",
          status: "scheduled",
          start_utc: "2024-01-02T02:00:00Z",
          end_utc: "2024-01-02T02:30:00Z",
        },
      ],
      habitTypeById,
    });

    expect(capturedStarts[0]).toBe("2024-01-02T02:00:00.000Z");
    expect(capturedStarts[1]).toBe("2024-01-02T02:30:00.000Z");
  });

  it("reuses blocker cache entries for the same day/timezone", async () => {
    const fetchInstancesMock = instanceRepo.fetchInstancesForRange as unknown as vi.Mock;
    fetchInstancesMock.mockResolvedValue({
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    });

    const blockerCache = new Map<string, ScheduleInstance[]>();
    const day = new Date("2024-01-04T08:00:00Z");
    const windowEnd = new Date("2024-01-04T10:00:00Z");

    const buildParams = () => ({
      userId: "user-1",
      item: {
        id: "proj-cache",
        sourceType: "PROJECT",
        duration_min: 30,
        energy: "MEDIUM",
        weight: 1,
      },
      windows: [
        {
          id: "win-cache",
          startLocal: day,
          endLocal: windowEnd,
        },
      ],
      date: day,
      timeZone: "America/Chicago",
      blockerCache,
    });

    await placeItemInWindows(buildParams());
    await placeItemInWindows(buildParams());

    expect(fetchInstancesMock).toHaveBeenCalledTimes(1);
  });
});
