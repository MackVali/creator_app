import { describe, expect, it } from "vitest";

import {
  calculateFocusGateXpToday,
  deriveFocusGateAllowance,
} from "@/lib/focus-gate/server";
import { resolveCreatorDay } from "@/lib/creatorDay";

type XpRow = {
  amount: number;
  award_key: string | null;
};

function xpClient({
  currentDayRows,
  reversalAwardKeys = [],
}: {
  currentDayRows: XpRow[];
  reversalAwardKeys?: string[];
}) {
  return {
    from(table: string) {
      expect(table).toBe("xp_events");
      let selectColumns = "";
      let minAmount: number | null = null;
      const query = {
        select: (columns: string) => {
          selectColumns = columns;
          return query;
        },
        eq: () => query,
        gte: () => query,
        gt: (column: string, value: number) => {
          if (column === "amount") {
            minAmount = value;
          }
          return query;
        },
        lt: () =>
          Promise.resolve({
            data: currentDayRows.filter(
              (row) => minAmount === null || row.amount > minAmount
            ),
            error: null,
          }),
        in: (_column: string, values: string[]) => {
          expect(selectColumns).toBe("award_key");
          return Promise.resolve({
            data: reversalAwardKeys
              .filter((awardKey) => values.includes(awardKey))
              .map((award_key) => ({ award_key })),
            error: null,
          });
        },
      };
      return query;
    },
  };
}

describe("Focus Gate allowance", () => {
  it.each([
    [1, 5, 5],
    [3, 5, 15],
    [5, 5, 25],
  ])("%i XP * %i min = %i minutes", (xpToday, minutesPerXp, expected) => {
    expect(
      deriveFocusGateAllowance({
        xpToday,
        settings: { enabled: true, minutesPerXp, dailyMaxMinutes: null },
      }).allowedMinutes
    ).toBe(expected);
  });

  it("applies an optional daily cap", () => {
    expect(
      deriveFocusGateAllowance({
        xpToday: 20,
        settings: { enabled: true, minutesPerXp: 5, dailyMaxMinutes: 60 },
      })
    ).toMatchObject({ baseAllowedMinutes: 100, allowedMinutes: 60 });
  });

  it("leaves uncapped allowance at the base value", () => {
    expect(
      deriveFocusGateAllowance({
        xpToday: 20,
        settings: { enabled: true, minutesPerXp: 5, dailyMaxMinutes: null },
      })
    ).toMatchObject({ baseAllowedMinutes: 100, allowedMinutes: 100 });
  });

  it("counts a current-day award with no reversal", async () => {
    const xpToday = await calculateFocusGateXpToday({
      client: xpClient({
        currentDayRows: [{ amount: 1, award_key: "sched:today:habit" }],
      }) as never,
      userId: "user-1",
      startsAt: "2026-08-15T09:00:00.000Z",
      endsAt: "2026-08-16T09:00:00.000Z",
    });

    expect(xpToday).toBe(1);
  });

  it("stops counting a current-day award reversed during the same day", async () => {
    const xpToday = await calculateFocusGateXpToday({
      client: xpClient({
        currentDayRows: [{ amount: 1, award_key: "sched:today:habit" }],
        reversalAwardKeys: ["reverse:sched:today:habit"],
      }) as never,
      userId: "user-1",
      startsAt: "2026-08-15T09:00:00.000Z",
      endsAt: "2026-08-16T09:00:00.000Z",
    });

    expect(xpToday).toBe(0);
  });

  it("does not let a previous-day award reversed today affect current-day XP", async () => {
    const xpToday = await calculateFocusGateXpToday({
      client: xpClient({
        currentDayRows: [
          { amount: -1, award_key: "reverse:sched:yesterday:habit" },
        ],
      }) as never,
      userId: "user-1",
      startsAt: "2026-08-15T09:00:00.000Z",
      endsAt: "2026-08-16T09:00:00.000Z",
    });

    expect(xpToday).toBe(0);
  });

  it("counts a new current-day award when a previous-day award is reversed today", async () => {
    const xpToday = await calculateFocusGateXpToday({
      client: xpClient({
        currentDayRows: [
          { amount: -1, award_key: "reverse:sched:yesterday:habit" },
          { amount: 1, award_key: "sched:today:habit" },
        ],
      }) as never,
      userId: "user-1",
      startsAt: "2026-08-15T09:00:00.000Z",
      endsAt: "2026-08-16T09:00:00.000Z",
    });

    expect(xpToday).toBe(1);
  });

  it("counts an active current-day project award by amount", async () => {
    const xpToday = await calculateFocusGateXpToday({
      client: xpClient({
        currentDayRows: [{ amount: 3, award_key: "sched:today:project" }],
      }) as never,
      userId: "user-1",
      startsAt: "2026-08-15T09:00:00.000Z",
      endsAt: "2026-08-16T09:00:00.000Z",
    });

    expect(xpToday).toBe(3);
  });

  it("counts only active XP from mixed current-day awards", async () => {
    const xpToday = await calculateFocusGateXpToday({
      client: xpClient({
        currentDayRows: [
          { amount: 1, award_key: "sched:today:habit" },
          { amount: 3, award_key: "sched:today:project" },
          { amount: 1, award_key: "sched:today:task" },
          { amount: 2, award_key: null },
        ],
        reversalAwardKeys: [
          "reverse:sched:today:habit",
          "reverse:sched:today:project",
        ],
      }) as never,
      userId: "user-1",
      startsAt: "2026-08-15T09:00:00.000Z",
      endsAt: "2026-08-16T09:00:00.000Z",
    });

    expect(xpToday).toBe(3);
  });

  it("uses the centralized 4 AM Creator-day resolver", () => {
    const creatorDay = resolveCreatorDay({
      instant: new Date("2026-08-15T08:59:00Z"),
      profileTimezone: "America/Chicago",
    });

    expect(creatorDay.creatorDayDate).toBe("2026-08-14");
    expect(creatorDay.startsAt).toBe("2026-08-14T09:00:00.000Z");
    expect(creatorDay.endsAt).toBe("2026-08-15T09:00:00.000Z");
  });
});
