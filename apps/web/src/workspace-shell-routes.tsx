import { WorkspaceShell } from "./app-workspace-shell";
import {
  WorkspaceShellRouteContent,
  type WorkspaceShellRouteContentProps,
} from "./workspace-shell-route-content";
import { useI18n } from "./i18n";

type WorkspaceShellRoutesProps = WorkspaceShellRouteContentProps;

export function WorkspaceShellRoutes(props: WorkspaceShellRoutesProps) {
  const { session, shell } = props;
  const { t } = useI18n();
  const routeTitle =
    props.route === "not-found" ? t("route.notFound") : shell.navigationModel.activeRouteLabel;

  return (
    <>
      <WorkspaceShell
        actions={shell.actions}
        error={session.error}
        navigation={shell.navigationModel.primaryNavigation}
        notice={session.noticeText}
        routeKey={props.route}
        routeTitle={routeTitle}
        subNavigation={shell.navigationModel.subNavigation}
        onCommand={shell.onCommand}
      >
        <WorkspaceShellRouteContent {...props} />
      </WorkspaceShell>
      {shell.overlays}
    </>
  );
}
