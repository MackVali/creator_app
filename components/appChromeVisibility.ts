const FOCUSED_EDITOR_ROUTES = new Set(["/profile/edit"]);

export function shouldHideBottomChrome(pathname: string | null | undefined) {
  return pathname?.startsWith("/schedule") || FOCUSED_EDITOR_ROUTES.has(pathname ?? "");
}

export function shouldUseFocusedEditorSpacing(pathname: string | null | undefined) {
  return FOCUSED_EDITOR_ROUTES.has(pathname ?? "");
}
