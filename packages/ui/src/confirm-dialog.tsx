import type { ReactNode } from "react";
import { Button } from "./button";
import { DialogClose, DialogContent, DialogDescription, DialogRoot, DialogTitle } from "./dialog";
import { cn } from "./utils";

export function ConfirmDialog(props: {
  cancelLabel: string;
  children?: ReactNode | undefined;
  className?: string | undefined;
  confirmLabel: string;
  description?: ReactNode | undefined;
  disabled?: boolean | undefined;
  onConfirm: () => void;
  onOpenChange?: (open: boolean) => void;
  open: boolean;
  title: ReactNode;
  tone?: "danger" | "neutral" | undefined;
}) {
  return (
    <DialogRoot open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className={cn("qitu-confirm-dialog", props.className)}>
        <DialogTitle className="qitu-confirm-dialog-title">{props.title}</DialogTitle>
        {props.description ? (
          <DialogDescription className="qitu-confirm-dialog-description">
            {props.description}
          </DialogDescription>
        ) : null}
        {props.children}
        <div className="mt-[var(--qitu-space-s1)] flex justify-end gap-2">
          <DialogClose render={<Button variant="ghost">{props.cancelLabel}</Button>} />
          <Button
            className={props.tone === "danger" ? "text-[var(--qitu-red)]" : undefined}
            disabled={props.disabled}
            variant="secondary"
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
