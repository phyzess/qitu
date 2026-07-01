import type { ReactNode } from "react";
import { cn } from "./utils";

export type SegmentedControlItem<TValue extends string> = {
  disabled?: boolean | undefined;
  icon?: ReactNode | undefined;
  label: ReactNode;
  value: TValue;
};

export function SegmentedControl<TValue extends string>(props: {
  "aria-label"?: string | undefined;
  className?: string | undefined;
  items: Array<SegmentedControlItem<TValue>>;
  onValueChange: (value: TValue) => void;
  value: TValue;
}) {
  return (
    <div
      aria-label={props["aria-label"]}
      className={cn("qitu-segment-track grid gap-2", props.className)}
      role="radiogroup"
    >
      {props.items.map((item) => {
        const selected = item.value === props.value;

        return (
          <button
            aria-checked={selected}
            className={cn("qitu-segment-tab", selected && "qitu-segment-tab-active")}
            disabled={item.disabled}
            key={item.value}
            role="radio"
            type="button"
            onClick={() => props.onValueChange(item.value)}
          >
            {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
            <span className="min-w-0 truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
