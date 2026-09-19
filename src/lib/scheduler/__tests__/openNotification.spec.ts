import { describe, expect, it } from "vitest";
import { ilavCheckInUrlForNotificationPayload } from "@/lib/notifications/openNotification";

describe("ilavCheckInUrlForNotificationPayload", () => {
  it("resolves ilav_checkin notifications to the ILAV route and check-in type", () => {
    expect(
      ilavCheckInUrlForNotificationPayload({
        type: "ilav_checkin",
        checkInType: "midday",
        creatorDayDate: "2026-09-18",
      })
    ).toBe("/schedule?ilav_checkin=midday&creatorDayDate=2026-09-18");
  });

  it("rejects invalid check-in types", () => {
    expect(
      ilavCheckInUrlForNotificationPayload({
        type: "ilav_checkin",
        checkInType: "lunch",
      })
    ).toBeNull();
  });
});

