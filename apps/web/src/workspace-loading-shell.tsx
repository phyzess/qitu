import { useMemo } from "react";
import {
  AnimatedIcon,
  AppShell,
  Button,
  StatusBadge,
  Surface,
  WorkbenchGrid,
  WorkbenchPage,
} from "@qitu/ui";
import { ChevronDown } from "lucide-react";
import { buildNavigation, type AppNavigationModel } from "./app-navigation";
import type { AppRoute } from "./app-routes";
import { useI18n } from "./i18n";
import { LanguageSelector, ThemeToggleButton } from "./shell-controls";

export function ProtectedWorkspaceLoading(props: { notice: string; route: AppRoute }) {
  const { t } = useI18n();
  const navigationModel = useMemo<AppNavigationModel>(
    () =>
      buildNavigation(props.route, {
        authenticated: true,
        canManageUsers: true,
        onNavigate: () => undefined,
        t,
      }),
    [props.route, t],
  );
  const routeTitle =
    props.route === "not-found" ? t("route.notFound") : navigationModel.activeRouteLabel;
  const skeletonPanels = (
    <>
      <Surface className="p-[var(--qitu-space-s1)]">
        <StatusBadge tone="info">{t("loading.session")}</StatusBadge>
        <h2 className="mt-3 text-[length:var(--qitu-text-heading-20)] font-semibold leading-[var(--qitu-leading-heading-20)]">
          {t("workspace.loadingTitle")}
        </h2>
        <p className="mt-2 max-w-[34rem] text-[length:var(--qitu-text-copy-13)] leading-[var(--qitu-leading-copy-13)] text-[var(--qitu-muted)]">
          {t("workspace.loadingDescription")}
        </p>
        <div className="mt-[var(--qitu-space-s1)] grid gap-3" aria-hidden="true">
          <span className="qitu-skeleton h-9 rounded-[var(--qitu-radius-md)]" />
          <span className="qitu-skeleton h-20 rounded-[var(--qitu-radius-md)]" />
          <span className="qitu-skeleton h-20 rounded-[var(--qitu-radius-md)]" />
        </div>
      </Surface>
      <Surface className="p-[var(--qitu-space-s1)]">
        <div className="grid gap-3" aria-hidden="true">
          <span className="qitu-skeleton h-8 rounded-[var(--qitu-radius-md)]" />
          <span className="qitu-skeleton h-24 rounded-[var(--qitu-radius-md)]" />
          <span className="qitu-skeleton h-24 rounded-[var(--qitu-radius-md)]" />
        </div>
      </Surface>
    </>
  );
  const singleColumnSkeleton =
    props.route === "overview" || props.route === "not-found" || props.route === "login";

  return (
    <AppShell
      actions={<WorkspaceLoadingActions />}
      brand="qitu"
      contentKey={props.route}
      contentTitle={routeTitle}
      commandLabel={t("command.findSourceJobUserAudit")}
      commandShortcutLabel="Cmd K"
      documentTitle={`${routeTitle} · qitu`}
      eyebrow={props.notice}
      navigation={navigationModel.primaryNavigation}
      primaryNavigationLabel={t("nav.primaryNavigation")}
      sectionNavigationLabel={t("nav.sectionNavigation")}
      skipLinkLabel={t("nav.skipToContent")}
      subNavigation={navigationModel.subNavigation}
    >
      {singleColumnSkeleton ? (
        <WorkbenchPage>{skeletonPanels}</WorkbenchPage>
      ) : (
        <WorkbenchGrid layout={props.route === "audit" ? "context-wide" : "context"}>
          {skeletonPanels}
        </WorkbenchGrid>
      )}
    </AppShell>
  );
}

function WorkspaceLoadingActions() {
  const { t } = useI18n();

  return (
    <>
      <Button
        aria-label={t("action.refreshWorkspace")}
        className="qitu-topbar-control"
        disabled
        size="sm"
        title={t("action.refreshWorkspace")}
        variant="ghost"
      >
        <AnimatedIcon name="refresh" size={15} />
        <span className="sr-only">{t("action.refresh")}</span>
      </Button>
      <LanguageSelector className="qitu-topbar-control" compact />
      <ThemeToggleButton className="qitu-topbar-control" compact />
      <Button
        aria-label={t("workspace.loadingTitle")}
        className="qitu-account-trigger"
        disabled
        size="sm"
        title={t("workspace.loadingTitle")}
        variant="ghost"
      >
        <span className="qitu-avatar-mark qitu-skeleton size-8" aria-hidden="true" />
        <ChevronDown size={14} className="text-[var(--qitu-dim)]" />
      </Button>
    </>
  );
}
