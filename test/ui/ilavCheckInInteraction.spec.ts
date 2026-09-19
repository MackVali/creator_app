import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/ai/OperatorAiSheet.tsx", "utf8");

describe("ILAV check-in interaction wiring", () => {
  it("refreshes the current check-in after successful row completion", () => {
    const completionStart = source.indexOf("const completeCheckInItem = React.useCallback");
    expect(completionStart).toBeGreaterThanOrEqual(0);
    const completionBlock = source.slice(
      completionStart,
      source.indexOf("React.useEffect", completionStart)
    );

    expect(completionBlock).toContain('fetch("/api/ai/operator/check-in/complete"');
    expect(completionBlock).toContain("const refreshed = await fetchCheckIn");
    expect(completionBlock).toContain("message.id === messageId");
    expect(completionBlock).toContain("checkIn: refreshed");
  });

  it("prevents duplicate row completion calls while a row is pending", () => {
    expect(source).toContain("pendingCheckInCompletionKeysRef.current.has(completionKey)");
    expect(source).toContain("pendingCheckInCompletionKeysRef.current.add(completionKey)");
    expect(source).toContain("pendingCheckInCompletionKeysRef.current.delete(completionKey)");
  });

  it("dev morning, midday, and night preview buttons use the real check-in builder endpoint", () => {
    const devButtonsStart = source.indexOf("{ILAV_CHECK_IN_TYPES.map((type)");
    expect(devButtonsStart).toBeGreaterThanOrEqual(0);
    const devButtonsBlock = source.slice(devButtonsStart, devButtonsStart + 600);

    expect(devButtonsBlock).toContain("onClick={() => void loadCheckIn(type)}");
    expect(source).toContain('fetch(`/api/ai/operator/check-in?${params}`)');
    expect(source).not.toContain("fake Night");
    expect(source).not.toContain("fakeNight");
  });
});
