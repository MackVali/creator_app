export const MAIN_TAB_ROUTES = [
  { key: "command", label: "COMMAND", href: "/dashboard" },
  { key: "connect", label: "CONNECT", href: "/friends" },
  { key: "schedule", label: "SCHEDULE", href: "/schedule" },
  { key: "source", label: "SOURCE", href: "/source" },
] as const;

type MainTabRoute = (typeof MAIN_TAB_ROUTES)[number];

export type MainTabRouteKey = MainTabRoute["key"];
export type MainTabRouteHref = MainTabRoute["href"];

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

export const routes = MAIN_TAB_ROUTES;
