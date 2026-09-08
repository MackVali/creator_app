export const AREA_CARD_STATUS_REFRESH_EVENT =
  "creator:area-card-status-refresh";

export function dispatchAreaCardStatusRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AREA_CARD_STATUS_REFRESH_EVENT));
}
