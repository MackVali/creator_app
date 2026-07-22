import { describe, expect, it } from "vitest";
import { resolveCreatorDay } from "../creatorDay";

describe("resolveCreatorDay", () => {
  it.each([
    ["before 4", "2026-07-22T03:59:00-05:00", "2026-07-21"],
    ["at 4", "2026-07-22T04:00:00-05:00", "2026-07-22"],
    ["after 4", "2026-07-22T12:00:00-05:00", "2026-07-22"],
  ])("uses the Creator-day boundary %s", (_label, instant, expected) => {
    expect(resolveCreatorDay({ instant: new Date(instant), profileTimezone: "America/Chicago" }).creatorDayDate).toBe(expected);
  });

  it("prefers the profile timezone", () => {
    const day = resolveCreatorDay({ instant: new Date("2026-07-22T08:30:00Z"), profileTimezone: "America/Los_Angeles", deviceTimezone: "Asia/Tokyo" });
    expect(day.timezoneSource).toBe("profile");
    expect(day.creatorDayDate).toBe("2026-07-21");
  });

  it("falls back to a valid device timezone", () => {
    const day = resolveCreatorDay({ deviceTimezone: "Europe/London" });
    expect(day).toMatchObject({ timezone: "Europe/London", timezoneSource: "device" });
  });

  it("falls back to UTC for absent or invalid timezones", () => {
    expect(resolveCreatorDay({ profileTimezone: "invalid", deviceTimezone: "also-invalid" })).toMatchObject({ timezone: "UTC", timezoneSource: "utc" });
    expect(resolveCreatorDay()).toMatchObject({ timezone: "UTC", timezoneSource: "utc" });
  });

  it("creates a 23-hour spring DST Creator day", () => {
    const day = resolveCreatorDay({ instant: new Date("2026-03-08T08:30:00Z"), profileTimezone: "America/Chicago" });
    expect((Date.parse(day.endsAt) - Date.parse(day.startsAt)) / 3_600_000).toBe(23);
  });

  it("creates a 25-hour autumn DST Creator day", () => {
    const day = resolveCreatorDay({ instant: new Date("2026-11-01T09:30:00Z"), profileTimezone: "America/Chicago" });
    expect((Date.parse(day.endsAt) - Date.parse(day.startsAt)) / 3_600_000).toBe(25);
  });
});
