export type AuthRoute =
  | {
      kind: "home";
    }
  | {
      kind: "invite";
      token: string;
    }
  | {
      kind: "reset";
      token: string;
    };

export function readAuthRoute(): AuthRoute {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const [kind, token] = segments;

  if (kind === "invite" && token) {
    return {
      kind: "invite",
      token: decodeURIComponent(token),
    };
  }

  if (kind === "reset-password" && token) {
    return {
      kind: "reset",
      token: decodeURIComponent(token),
    };
  }

  return {
    kind: "home",
  };
}

export function replaceAuthPath(path: string, setAuthRoute: (route: AuthRoute) => void): void {
  window.history.replaceState(null, "", path);
  setAuthRoute(readAuthRoute());
}
