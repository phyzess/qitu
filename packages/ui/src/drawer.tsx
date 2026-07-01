import { Drawer as BaseDrawer } from "@base-ui/react/drawer";
import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "./utils";

export const DrawerRoot = BaseDrawer.Root;
export const DrawerTrigger = BaseDrawer.Trigger;
export const DrawerClose = BaseDrawer.Close;
export const DrawerTitle = BaseDrawer.Title;
export const DrawerDescription = BaseDrawer.Description;

export function DrawerContent(
  props: ComponentPropsWithoutRef<typeof BaseDrawer.Popup> & {
    backdropClassName?: string | undefined;
    children: ReactNode;
    className?: string | undefined;
  },
) {
  const { backdropClassName, children, className, ...popupProps } = props;

  return (
    <BaseDrawer.Portal>
      <BaseDrawer.Backdrop
        className={cn("qitu-overlay-backdrop fixed inset-0", backdropClassName)}
      />
      <BaseDrawer.Viewport className="qitu-drawer-viewport">
        <BaseDrawer.Popup
          className={cn("qitu-surface qitu-overlay-surface qitu-drawer-content", className)}
          {...popupProps}
        >
          {children}
        </BaseDrawer.Popup>
      </BaseDrawer.Viewport>
    </BaseDrawer.Portal>
  );
}
