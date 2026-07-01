import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { DrawerClose, DrawerContent, DrawerDescription, DrawerRoot, DrawerTitle } from "./drawer";

type DrawerCloseRender = ComponentPropsWithoutRef<typeof DrawerClose>["render"];

export function DetailDrawer(props: {
  children: ReactNode;
  closeAction: DrawerCloseRender;
  description?: ReactNode;
  onOpenChange?: (open: boolean) => void;
  open: boolean;
  title: ReactNode;
}) {
  return (
    <DrawerRoot open={props.open} onOpenChange={props.onOpenChange}>
      <DrawerContent>
        <div className="qitu-detail-drawer-header">
          <div className="qitu-detail-drawer-heading">
            <DrawerTitle className="qitu-detail-drawer-title">{props.title}</DrawerTitle>
            {props.description ? (
              <DrawerDescription className="qitu-detail-drawer-description">
                {props.description}
              </DrawerDescription>
            ) : null}
          </div>
          <DrawerClose render={props.closeAction} />
        </div>
        {props.children}
      </DrawerContent>
    </DrawerRoot>
  );
}
