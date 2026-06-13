const FOCUSED_EDITOR_ROUTES = new Set(["/profile/edit"]);
const INDIVIDUAL_NOTE_ROUTE_PATTERN =
  /^\/(?:monuments|skills)\/[^/]+\/notes\/[^/]+\/?$/;

export function isIndividualNoteRoute(pathname: string | null | undefined) {
  return Boolean(pathname && INDIVIDUAL_NOTE_ROUTE_PATTERN.test(pathname));
}

export function isMatrixRoute(pathname: string | null | undefined) {
  return pathname === "/schedule/matrix" || Boolean(pathname?.startsWith("/schedule/matrix/"));
}

export function isScheduleRoute(pathname: string | null | undefined) {
  if (isMatrixRoute(pathname)) {
    return false;
  }

  return pathname === "/schedule" || Boolean(pathname?.startsWith("/schedule/"));
}

export function isCircleDetailRoute(pathname: string | null | undefined) {
  return Boolean(pathname?.startsWith("/friends/circles/"));
}

export function shouldHideBottomChrome(pathname: string | null | undefined) {
  return (
    isScheduleRoute(pathname) ||
    isIndividualNoteRoute(pathname) ||
    FOCUSED_EDITOR_ROUTES.has(pathname ?? "")
  );
}

export function shouldUseFocusedEditorSpacing(pathname: string | null | undefined) {
  return isIndividualNoteRoute(pathname) || FOCUSED_EDITOR_ROUTES.has(pathname ?? "");
}

export function shouldUseCompactTopSpacing(pathname: string | null | undefined) {
  return isCircleDetailRoute(pathname);
}
