import { ProfileModuleAnalyticsEvent } from "./types";

export function emitProfileModuleEvent(detail: ProfileModuleAnalyticsEvent) {
  if (typeof window === "undefined") {
    return;
  }

  const payload = {
    ...detail,
    timestamp: Date.now(),
  } satisfies ProfileModuleAnalyticsEvent & { timestamp: number };

  window.dispatchEvent(new CustomEvent("profile-module-event", { detail: payload }));

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console -- Useful during development to validate analytics wiring.
    console.debug("[profile-module-event]", payload);
  }
}
