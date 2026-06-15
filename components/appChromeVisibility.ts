const FOCUSED_EDITOR_ROUTES = new Set(["/profile/edit"]);
const INDIVIDUAL_NOTE_ROUTE_PATTERN =
  /^\/(?:monuments|skills)\/[^/]+\/notes\/[^/]+\/?$/;
const INDIVIDUAL_INBOX_THREAD_ROUTE_PATTERN = /^\/inbox\/[^/]+\/?$/;

export function isIndividualNoteRoute(pathname: string | null | undefined) {
  return Boolean(pathname && INDIVIDUAL_NOTE_ROUTE_PATTERN.test(pathname));
}

export function isIndividualInboxThreadRoute(pathname: string | null | undefined) {
  return Boolean(pathname && INDIVIDUAL_INBOX_THREAD_ROUTE_PATTERN.test(pathname));
}

export function isMatrixRoute(pathname: string | null | undefined) {
  return pathname === "/schedule/matrix" || Boolean(pathname?.startsWith("/schedule/matrix/"));
}

export function isPriorityEditorRoute(pathname: string | null | undefined) {
  return pathname === "/schedule/priorities" || Boolean(pathname?.startsWith("/schedule/priorities/"));
}

export function isScheduleRoute(pathname: string | null | undefined) {
  if (isMatrixRoute(pathname) || isPriorityEditorRoute(pathname)) {
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
    isIndividualInboxThreadRoute(pathname) ||
    FOCUSED_EDITOR_ROUTES.has(pathname ?? "")
  );
}

export function shouldUseFocusedEditorSpacing(pathname: string | null | undefined) {
  return (
    isIndividualInboxThreadRoute(pathname) ||
    FOCUSED_EDITOR_ROUTES.has(pathname ?? "")
  );
}

export function shouldUseCompactTopSpacing(pathname: string | null | undefined) {
  return isCircleDetailRoute(pathname);
}
