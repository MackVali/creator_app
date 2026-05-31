const FOCUSED_EDITOR_ROUTES = new Set(["/profile/edit"]);

export function isScheduleRoute(pathname: string | null | undefined) {
  return pathname === "/schedule" || Boolean(pathname?.startsWith("/schedule/"));
}

export function isCircleDetailRoute(pathname: string | null | undefined) {
  return Boolean(pathname?.startsWith("/friends/circles/"));
}

export function shouldHideBottomChrome(pathname: string | null | undefined) {
  return isScheduleRoute(pathname) || FOCUSED_EDITOR_ROUTES.has(pathname ?? "");
}

export function shouldUseFocusedEditorSpacing(pathname: string | null | undefined) {
  return FOCUSED_EDITOR_ROUTES.has(pathname ?? "");
}

export function shouldUseCompactTopSpacing(pathname: string | null | undefined) {
  return isCircleDetailRoute(pathname);
}
