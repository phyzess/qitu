import { Menu as BaseMenu } from "@base-ui/react/menu";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "./utils";

export const MenuRoot = BaseMenu.Root;
export const MenuTrigger = BaseMenu.Trigger;
export const MenuRadioGroup = BaseMenu.RadioGroup;
export const MenuSeparator = BaseMenu.Separator;

export function MenuContent(props: {
  align?: ComponentPropsWithoutRef<typeof BaseMenu.Positioner>["align"];
  children: ReactNode;
  className?: string | undefined;
  side?: ComponentPropsWithoutRef<typeof BaseMenu.Positioner>["side"];
  sideOffset?: ComponentPropsWithoutRef<typeof BaseMenu.Positioner>["sideOffset"];
}) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner
        align={props.align ?? "end"}
        className="qitu-overlay-positioner"
        side={props.side ?? "bottom"}
        sideOffset={props.sideOffset ?? 6}
      >
        <BaseMenu.Popup
          className={cn(
            "qitu-surface qitu-overlay-surface qitu-menu-content min-w-44 overflow-hidden p-1",
            props.className,
          )}
        >
          {props.children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

export function MenuGroupLabel(props: { children: ReactNode; className?: string | undefined }) {
  return (
    <BaseMenu.GroupLabel
      className={cn(
        "px-2 py-1 text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]",
        props.className,
      )}
    >
      {props.children}
    </BaseMenu.GroupLabel>
  );
}

export const MenuItem = forwardRef<
  HTMLElement,
  ComponentPropsWithoutRef<typeof BaseMenu.Item> & { className?: string | undefined }
>(({ className, ...props }, ref) => {
  return <BaseMenu.Item ref={ref} className={cn("qitu-panel-action", className)} {...props} />;
});

MenuItem.displayName = "MenuItem";

export const MenuRadioItem = forwardRef<
  HTMLElement,
  ComponentPropsWithoutRef<typeof BaseMenu.RadioItem> & { className?: string | undefined }
>(({ className, closeOnClick = true, ...props }, ref) => {
  return (
    <BaseMenu.RadioItem
      ref={ref}
      className={cn("qitu-panel-action", className)}
      closeOnClick={closeOnClick}
      {...props}
    />
  );
});

MenuRadioItem.displayName = "MenuRadioItem";

export const MenuRadioItemIndicator = BaseMenu.RadioItemIndicator;
