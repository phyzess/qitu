import {
  createRootRoute,
  createRoute,
  createRouter,
  type ErrorRouteProps,
} from "@tanstack/react-router";
import { App } from "./app";

const rootRoute = createRootRoute({
  component: App,
  notFoundComponent: App,
  errorComponent: RouterErrorBoundary,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "login",
});

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "overview",
});

const sourcesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "sources",
});

const importsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "imports",
});

const reviewsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "reviews",
});

const auditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "audit",
});

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "users",
});

const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "account",
});

const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "invite/$token",
});

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "reset-password/$token",
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  overviewRoute,
  sourcesRoute,
  importsRoute,
  reviewsRoute,
  auditRoute,
  usersRoute,
  accountRoute,
  inviteRoute,
  resetPasswordRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function RouterErrorBoundary(props: ErrorRouteProps) {
  throw props.error;
}
