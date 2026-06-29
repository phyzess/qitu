import type { CSSProperties, ReactNode } from "react";
import { cn } from "./utils";

export type AnimatedIconName =
  | "account"
  | "activity"
  | "audit"
  | "database"
  | "files"
  | "intake"
  | "key"
  | "language"
  | "login"
  | "logout"
  | "operations"
  | "refresh"
  | "reviews"
  | "search"
  | "settings"
  | "sparkles"
  | "theme"
  | "users"
  | "workbench";

export type AnimatedIconProps = {
  className?: string | undefined;
  name: AnimatedIconName;
  size?: number | string | undefined;
  title?: string | undefined;
};

type IconMotion =
  | "activity"
  | "boxes"
  | "checks"
  | "folder"
  | "globe"
  | "grid"
  | "key"
  | "login"
  | "logout"
  | "moon"
  | "refresh"
  | "search"
  | "settings"
  | "shield"
  | "sparkles"
  | "upload"
  | "user"
  | "users";

type IconDefinition = {
  element: ReactNode;
  motion: IconMotion;
};

// SVG source is adapted from @animateicons/react/lucide v0.3.4 (MIT).
// Runtime motion is implemented locally so qitu ships only the selected icons.
const iconRegistry = {
  account: {
    motion: "user",
    element: (
      <>
        <circle className="qitu-icon-primary" cx="12" cy="8" r="5" />
        <path className="qitu-icon-secondary" d="M20 21a8 8 0 0 0-16 0" />
      </>
    ),
  },
  activity: {
    motion: "activity",
    element: (
      <path
        className="qitu-icon-primary"
        d="M2 12h2.49a2 2 0 0 0 1.92-1.46l2.35-8.36a.25.25 0 0 1 .48 0l5.52 19.64a.25.25 0 0 0 .48 0l2.35-8.36A2 2 0 0 1 19.52 12H22"
      />
    ),
  },
  audit: {
    motion: "shield",
    element: (
      <>
        <path
          className="qitu-icon-primary"
          d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
        />
        <path className="qitu-icon-check" d="m9 12 2 2 4-4" />
      </>
    ),
  },
  database: {
    motion: "boxes",
    element: (
      <>
        <g className="qitu-icon-box qitu-icon-box-left">
          <path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z" />
          <path d="m7 16.5-4.74-2.85" />
          <path d="m7 16.5 5-3" />
          <path d="M7 16.5v5.17" />
        </g>
        <g className="qitu-icon-box qitu-icon-box-right">
          <path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z" />
          <path d="m17 16.5-5-3" />
          <path d="m17 16.5 4.74-2.85" />
          <path d="M17 16.5v5.17" />
        </g>
        <g className="qitu-icon-box qitu-icon-box-top">
          <path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z" />
          <path d="M12 8 7.26 5.15" />
          <path d="m12 8 4.74-2.85" />
          <path d="M12 13.5V8" />
        </g>
      </>
    ),
  },
  files: {
    motion: "folder",
    element: (
      <path
        className="qitu-icon-primary"
        d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"
      />
    ),
  },
  operations: {
    motion: "shield",
    element: (
      <>
        <path
          className="qitu-icon-primary"
          d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
        />
        <path className="qitu-icon-check" d="m9 12 2 2 4-4" />
      </>
    ),
  },
  intake: {
    motion: "upload",
    element: (
      <>
        <g className="qitu-icon-arrow">
          <path d="M12 3v12" />
          <path d="m17 8-5-5-5 5" />
        </g>
        <path className="qitu-icon-secondary" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      </>
    ),
  },
  key: {
    motion: "key",
    element: (
      <>
        <path
          className="qitu-icon-primary"
          d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"
        />
        <circle
          className="qitu-icon-dot"
          cx="16.5"
          cy="7.5"
          r="0.5"
          fill="currentColor"
          stroke="none"
        />
      </>
    ),
  },
  language: {
    motion: "globe",
    element: (
      <>
        <circle className="qitu-icon-primary" cx="12" cy="12" r="10" />
        <path className="qitu-icon-secondary" d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
        <path className="qitu-icon-equator" d="M2 12h20" />
      </>
    ),
  },
  login: {
    motion: "login",
    element: (
      <>
        <g className="qitu-icon-arrow">
          <path d="m10 17 5-5-5-5" />
          <path d="M15 12H3" />
        </g>
        <path className="qitu-icon-secondary" d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      </>
    ),
  },
  logout: {
    motion: "logout",
    element: (
      <>
        <g className="qitu-icon-arrow">
          <path d="m16 17 5-5-5-5" />
          <path d="M21 12H9" />
        </g>
        <path className="qitu-icon-secondary" d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      </>
    ),
  },
  refresh: {
    motion: "refresh",
    element: (
      <>
        <g className="qitu-icon-down">
          <path d="m3 16 4 4 4-4" />
          <path d="M7 20V4" />
        </g>
        <g className="qitu-icon-up">
          <path d="m21 8-4-4-4 4" />
          <path d="M17 4v16" />
        </g>
      </>
    ),
  },
  reviews: {
    motion: "checks",
    element: (
      <>
        <path className="qitu-icon-check qitu-icon-check-one" d="M18 6 7 17l-5-5" />
        <path className="qitu-icon-check qitu-icon-check-two" d="m22 10-7.5 7.5L13 16" />
      </>
    ),
  },
  search: {
    motion: "search",
    element: (
      <g className="qitu-icon-primary">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.34-4.34" />
      </g>
    ),
  },
  settings: {
    motion: "settings",
    element: (
      <g className="qitu-icon-primary">
        <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
        <circle cx="12" cy="12" r="3" />
      </g>
    ),
  },
  sparkles: {
    motion: "sparkles",
    element: (
      <>
        <path
          className="qitu-icon-primary"
          d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"
        />
        <path className="qitu-icon-secondary" d="M20 2v4" />
        <path className="qitu-icon-secondary" d="M22 4h-4" />
        <circle className="qitu-icon-dot" cx="4" cy="20" r="2" />
      </>
    ),
  },
  theme: {
    motion: "moon",
    element: (
      <path
        className="qitu-icon-primary"
        d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"
      />
    ),
  },
  users: {
    motion: "users",
    element: (
      <>
        <path className="qitu-icon-secondary" d="M18 21a8 8 0 0 0-16 0" />
        <circle className="qitu-icon-primary" cx="10" cy="8" r="5" />
        <path
          className="qitu-icon-tertiary"
          d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"
          opacity="0.7"
        />
      </>
    ),
  },
  workbench: {
    motion: "grid",
    element: (
      <>
        <rect
          className="qitu-icon-tile qitu-icon-tile-one"
          width="7"
          height="7"
          x="3"
          y="3"
          rx="1"
        />
        <rect
          className="qitu-icon-tile qitu-icon-tile-two"
          width="7"
          height="7"
          x="14"
          y="3"
          rx="1"
        />
        <rect
          className="qitu-icon-tile qitu-icon-tile-three"
          width="7"
          height="7"
          x="14"
          y="14"
          rx="1"
        />
        <rect
          className="qitu-icon-tile qitu-icon-tile-four"
          width="7"
          height="7"
          x="3"
          y="14"
          rx="1"
        />
      </>
    ),
  },
} satisfies Record<AnimatedIconName, IconDefinition>;

export function AnimatedIcon({ className, name, size = 16, title }: AnimatedIconProps) {
  const icon = iconRegistry[name];
  const style: CSSProperties = {
    height: size,
    width: size,
  };

  return (
    <span
      aria-hidden={title ? undefined : "true"}
      aria-label={title}
      className={cn("qitu-animated-icon", className)}
      data-icon={name}
      data-motion={icon.motion}
      role={title ? "img" : undefined}
      style={style}
    >
      <svg
        aria-hidden="true"
        className="qitu-animated-icon-svg"
        fill="none"
        focusable="false"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        viewBox="0 0 24 24"
      >
        {icon.element}
      </svg>
    </span>
  );
}
