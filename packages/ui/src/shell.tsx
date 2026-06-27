import type { ReactNode } from "react";
import { cn } from "./utils";

export type AppShellProps = {
  brand: string;
  navigation: Array<{ label: string; active?: boolean }>;
  actions?: ReactNode;
  children: ReactNode;
};

export function AppShell({ actions, brand, children, navigation }: AppShellProps) {
  return (
    <div className="min-h-[100dvh] bg-[var(--color-bg)] text-[var(--color-text)]">
      <header className="sticky top-0 z-10 bg-[color-mix(in_srgb,var(--color-bg)_88%,white)]/90 shadow-[0_1px_20px_rgba(22,22,21,0.06)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5">
          <div className="flex items-center gap-7">
            <div className="text-sm font-semibold tracking-normal">{brand}</div>
            <nav className="hidden items-center gap-1 md:flex">
              {navigation.map((item) => (
                <button
                  className={cn(
                    "h-8 rounded-md px-2.5 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-black/5 hover:text-[var(--color-text)]",
                    item.active && "bg-white text-[var(--color-text)] shadow-sm",
                  )}
                  key={item.label}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-6">{children}</main>
    </div>
  );
}
