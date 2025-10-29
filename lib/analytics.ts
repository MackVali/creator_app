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
    console.debug("[profile-module-event]", payload);
  }
}
