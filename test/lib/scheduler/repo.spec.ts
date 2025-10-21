import { describe, it, expect, vi } from "vitest";

import { fetchWindowsForDate, type WindowLite } from "../../../src/lib/scheduler/repo";

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
        location_context: null,
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
        location_context: null,
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
        location_context: null,
      },
      {
        id: "win-recurring-cross",
        label: "Every night",
        energy: "NO",
        start_local: "22:00",
        end_local: "02:00",
        days: null,
        location_context: null,
      },
    ];

    const containsResponses = new Map<string, WindowLite[]>([
      [JSON.stringify([weekday]), todayWindows],
      [JSON.stringify([prevWeekday]), prevWindows],
    ]);

    const select = vi.fn(() => ({
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
    }));

    const client = {
      from: vi.fn(() => ({ select })),
    } as const;

    const windows = await fetchWindowsForDate(date, client as never, 'UTC');

    expect(windows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "win-today" }),
        expect.objectContaining({ id: "win-recurring" }),
        expect.objectContaining({ id: "win-recurring-cross" }),
        expect.objectContaining({ id: "win-prev-cross", fromPrevDay: true }),
      ]),
    );

    const carryover = windows.filter(win => win.fromPrevDay);
    expect(carryover).toHaveLength(2);
    expect(carryover.map(win => win.id)).toEqual(
      expect.arrayContaining(["win-prev-cross", "win-recurring-cross"]),
    );

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
    const select = vi.fn(() => ({ contains: containsMock, is: isMock }));
    const client = { from: vi.fn(() => ({ select })) } as const;

    await fetchWindowsForDate(date, client as never, "Pacific/Auckland");

    expect(containsMock).toHaveBeenCalledWith("days", [2]);
    expect(containsMock).toHaveBeenCalledWith("days", [1]);
    expect(isMock).toHaveBeenCalledWith("days", null);
  });
});

