import { Popover as BasePopover } from "@base-ui/react/popover";
import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "./utils";

export const PopoverRoot = BasePopover.Root;
export const PopoverTrigger = BasePopover.Trigger;
export const PopoverClose = BasePopover.Close;
export const PopoverTitle = BasePopover.Title;
export const PopoverDescription = BasePopover.Description;

export function PopoverContent(props: {
  align?: ComponentPropsWithoutRef<typeof BasePopover.Positioner>["align"];
  children: ReactNode;
  className?: string | undefined;
  side?: ComponentPropsWithoutRef<typeof BasePopover.Positioner>["side"];
  sideOffset?: ComponentPropsWithoutRef<typeof BasePopover.Positioner>["sideOffset"];
}) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner
        align={props.align ?? "start"}
        className="qitu-overlay-positioner"
        side={props.side ?? "bottom"}
        sideOffset={props.sideOffset ?? 6}
      >
        <BasePopover.Popup
          className={cn("qitu-surface qitu-overlay-surface qitu-popover-content", props.className)}
        >
          {props.children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}
