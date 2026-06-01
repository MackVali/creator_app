export const MAIN_TAB_ROUTES = [
  { key: "command", label: "COMMAND", href: "/dashboard" },
  { key: "connect", label: "CONNECT", href: "/friends" },
  { key: "schedule", label: "SCHEDULE", href: "/schedule" },
  { key: "source", label: "SOURCE", href: "/source" },
] as const;

type MainTabRoute = (typeof MAIN_TAB_ROUTES)[number];

export type MainTabRouteKey = MainTabRoute["key"];
export type MainTabRouteHref = MainTabRoute["href"];
export type PersistentMainTabRouteHref = Exclude<MainTabRouteHref, "/schedule">;

export const tabRouteConfig = Object.fromEntries(
  MAIN_TAB_ROUTES.map(({ key, label, href }) => [key, { href, label }])
) as {
  [Route in MainTabRoute as Route["key"]]: Pick<Route, "href" | "label">;
};

export const tabRouteHrefs = Object.fromEntries(
  MAIN_TAB_ROUTES.map(({ key, href }) => [key, href])
) as {
  [Route in MainTabRoute as Route["key"]]: Route["href"];
};

export const PERSISTENT_MAIN_TAB_ROUTES = [
  tabRouteHrefs.command,
  tabRouteHrefs.connect,
  tabRouteHrefs.source,
] as const satisfies readonly PersistentMainTabRouteHref[];

export function isPersistentMainTabRoute(
  href: string
): href is PersistentMainTabRouteHref {
  return (PERSISTENT_MAIN_TAB_ROUTES as readonly string[]).includes(href);
}

export function navigateMainTabRoute(
  href: MainTabRouteHref,
  pushRoute: (href: MainTabRouteHref) => void
) {
  if (isPersistentMainTabRoute(href) && typeof window !== "undefined") {
    window.history.pushState(null, "", href);
    return;
  }

  pushRoute(href);
}

export const routes = MAIN_TAB_ROUTES;
