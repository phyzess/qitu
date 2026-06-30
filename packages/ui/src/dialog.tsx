import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "./utils";

export const DialogRoot = BaseDialog.Root;
export const DialogClose = BaseDialog.Close;
export const DialogTitle = BaseDialog.Title;
export const DialogDescription = BaseDialog.Description;

export function DialogContent(
  props: ComponentPropsWithoutRef<typeof BaseDialog.Popup> & {
    backdropClassName?: string | undefined;
    children: ReactNode;
    className?: string | undefined;
  },
) {
  const { backdropClassName, children, className, ...popupProps } = props;

  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop
        className={cn("qitu-overlay-backdrop fixed inset-0", backdropClassName)}
      />
      <BaseDialog.Popup
        className={cn("qitu-surface qitu-overlay-surface qitu-dialog-content", className)}
        {...popupProps}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}
