import { describe, expect, it } from "vitest";
import { resolveCreatorDay } from "@/lib/creatorDay";

describe("resolveCreatorDay", () => {
  it.each([["2026-07-22T03:59:00-05:00", "2026-07-21"], ["2026-07-22T04:00:00-05:00", "2026-07-22"], ["2026-07-22T12:00:00-05:00", "2026-07-22"]])("uses the 4 AM boundary for %s", (instant, expected) => expect(resolveCreatorDay({ instant: new Date(instant), profileTimezone: "America/Chicago" }).creatorDayDate).toBe(expected));
  it("uses profile, device, then UTC timezone precedence", () => {
    expect(resolveCreatorDay({ profileTimezone: "America/Los_Angeles", deviceTimezone: "Asia/Tokyo" }).timezoneSource).toBe("profile");
    expect(resolveCreatorDay({ profileTimezone: "bad", deviceTimezone: "Europe/London" }).timezoneSource).toBe("device");
    expect(resolveCreatorDay({ profileTimezone: "bad", deviceTimezone: "also-bad" }).timezoneSource).toBe("utc");
  });
  it.each([["2026-03-08T08:30:00Z", 23], ["2026-11-01T09:30:00Z", 25]])("resolves DST duration for %s", (instant, hours) => {
    const day = resolveCreatorDay({ instant: new Date(instant), profileTimezone: "America/Chicago" });
    expect((Date.parse(day.endsAt) - Date.parse(day.startsAt)) / 3_600_000).toBe(hours);
  });
});
