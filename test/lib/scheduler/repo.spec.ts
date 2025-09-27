import { describe, it, expect, vi } from "vitest";

import { fetchWindowsForDate, type WindowLite } from "../../../src/lib/scheduler/repo";

type WindowRecord = WindowLite & { user_id: string };

function createSupabaseStub(rows: WindowRecord[]) {
  const queries: Array<{
    eq: ReturnType<typeof vi.fn>;
    contains?: ReturnType<typeof vi.fn>;
    is?: ReturnType<typeof vi.fn>;
  }> = [];

  const select = vi.fn(() => {
    const query: {
      eq: ReturnType<typeof vi.fn>;
      contains?: ReturnType<typeof vi.fn>;
      is?: ReturnType<typeof vi.fn>;
    } = {} as never;

    query.eq = vi.fn((_column: string, value: string) => {
      const contains = vi.fn(async (_containsColumn: string, values: number[]) => {
        const data = rows
          .filter(row => row.user_id === value)
          .filter(row => Array.isArray(row.days) && values.every(v => row.days?.includes(v)))
          .map(({ user_id: _userId, ...rest }) => rest);
        return { data, error: null } as const;
      });

      const is = vi.fn(async (_isColumn: string, valueToMatch: number[] | null) => {
        const data = rows
          .filter(row => row.user_id === value)
          .filter(row => row.days === valueToMatch)
          .map(({ user_id: _userId, ...rest }) => rest);
        return { data, error: null } as const;
      });

      query.contains = contains;
      query.is = is;

      return { contains, is } as const;
    });

    queries.push(query);
    return { eq: query.eq } as const;
  });

  const from = vi.fn(() => ({ select }));

  return { from, queries } as const;
}

describe("fetchWindowsForDate", () => {
  it("includes recurring windows without day restrictions and their prior-day carryover", async () => {
    const date = new Date("2024-01-02T00:00:00Z");
    const weekday = date.getDay();
    const prevWeekday = (weekday + 6) % 7;
    const userId = "user-123";

    const todayWindows: WindowRecord[] = [
      {
        id: "win-today",
        label: "Today only",
        energy: "NO",
        start_local: "10:00",
        end_local: "12:00",
        days: [weekday],
        user_id: userId,
      },
    ];

    const prevWindows: WindowRecord[] = [
      {
        id: "win-prev-cross",
        label: "Yesterday overnight",
        energy: "NO",
        start_local: "23:00",
        end_local: "01:00",
        days: [prevWeekday],
        user_id: userId,
      },
    ];

    const recurringWindows: WindowRecord[] = [
      {
        id: "win-recurring",
        label: "Every day",
        energy: "NO",
        start_local: "08:00",
        end_local: "09:00",
        days: null,
        user_id: userId,
      },
      {
        id: "win-recurring-cross",
        label: "Every night",
        energy: "NO",
        start_local: "22:00",
        end_local: "02:00",
        days: null,
        user_id: userId,
      },
    ];

    const client = createSupabaseStub([
      ...todayWindows,
      ...prevWindows,
      ...recurringWindows,
    ]);

    const windows = await fetchWindowsForDate(date, userId, client as never, 'UTC');

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
    const client = createSupabaseStub([]);

    await fetchWindowsForDate(date, "user-123", client as never, "Pacific/Auckland");

    const [todayQuery, prevQuery, recurringQuery] = client.queries;

    expect(todayQuery.contains).toHaveBeenCalledWith("days", [2]);
    expect(prevQuery.contains).toHaveBeenCalledWith("days", [1]);
    expect(recurringQuery.is).toHaveBeenCalledWith("days", null);
  });

  it("only includes windows for the requested user", async () => {
    const date = new Date("2024-05-01T00:00:00Z");
    const weekday = date.getDay();
    const otherDay = (weekday + 1) % 7;

    const sharedWindows: WindowRecord[] = [
      {
        id: "user-a-today",
        label: "User A",
        energy: "NO",
        start_local: "09:00",
        end_local: "10:00",
        days: [weekday],
        user_id: "user-a",
      },
      {
        id: "user-b-today",
        label: "User B",
        energy: "NO",
        start_local: "11:00",
        end_local: "12:00",
        days: [weekday],
        user_id: "user-b",
      },
      {
        id: "user-b-prev",
        label: "User B prev",
        energy: "NO",
        start_local: "23:00",
        end_local: "01:00",
        days: [otherDay],
        user_id: "user-b",
      },
      {
        id: "user-a-recurring",
        label: "User A recurring",
        energy: "NO",
        start_local: "20:00",
        end_local: "22:00",
        days: null,
        user_id: "user-a",
      },
      {
        id: "user-b-recurring",
        label: "User B recurring",
        energy: "NO",
        start_local: "18:00",
        end_local: "19:00",
        days: null,
        user_id: "user-b",
      },
    ];

    const client = createSupabaseStub(sharedWindows);

    const windowsForA = await fetchWindowsForDate(date, "user-a", client as never, "UTC");

    expect(windowsForA.map(win => win.id)).toEqual(
      expect.arrayContaining(["user-a-today", "user-a-recurring"]),
    );
    expect(windowsForA.some(win => win.id.startsWith("user-b"))).toBe(false);

    for (const query of client.queries) {
      expect(query.eq).toHaveBeenCalledWith("user_id", expect.any(String));
    }
  });
});

