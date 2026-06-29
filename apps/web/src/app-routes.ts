export type AppRoute =
  | "overview"
  | "sources"
  | "imports"
  | "reviews"
  | "audit"
  | "users"
  | "account"
  | "login"
  | "not-found";

export type WorkspaceAppRoute = Exclude<AppRoute, "login" | "not-found">;
export type AppPrimaryRoute = "workbench" | "intake" | "governance" | "account";

export const defaultAuthenticatedPath = "/reviews";
export const loginPath = "/login";
export const appNavigationPaths = [
  "/",
  "/overview",
  "/sources",
  "/imports",
  "/reviews",
  "/audit",
  "/users",
  "/account",
  "/login",
] as const;
export type AppNavigationPath = (typeof appNavigationPaths)[number];

const routeByPath = new Map<string, AppRoute>([
  ["/", "reviews"],
  ["/overview", "overview"],
  ["/sources", "sources"],
  ["/imports", "imports"],
  ["/reviews", "reviews"],
  ["/audit", "audit"],
  ["/users", "users"],
  ["/account", "account"],
  [loginPath, "login"],
]);

export function appRouteFromPath(pathname: string): AppRoute {
  const path = normalizePath(pathname);
  return routeByPath.get(path) ?? "not-found";
}

export function isProtectedRoute(route: AppRoute): boolean {
  return route !== "login";
}

export function isWorkspaceAppRoute(route: AppRoute): route is WorkspaceAppRoute {
  return route !== "login" && route !== "not-found";
}

export function primaryRouteFor(route: AppRoute): AppPrimaryRoute | null {
  switch (route) {
    case "overview":
    case "reviews":
      return "workbench";
    case "sources":
    case "imports":
      return "intake";
    case "audit":
    case "users":
      return "governance";
    case "account":
      return "account";
    case "login":
    case "not-found":
      return null;
  }
}

export function routePath(route: Exclude<AppRoute, "not-found">): AppNavigationPath {
  if (route === "reviews") return defaultAuthenticatedPath;
  if (route === "login") return loginPath;
  return `/${route}` as AppNavigationPath;
}

export function isAppNavigationPath(path: string): path is AppNavigationPath {
  return appNavigationPaths.includes(path as AppNavigationPath);
}

function normalizePath(path: string): string {
  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }

  return path;
}
