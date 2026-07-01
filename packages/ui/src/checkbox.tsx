import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Check, Minus } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "./utils";

export type CheckboxProps = ComponentPropsWithoutRef<typeof BaseCheckbox.Root> & {
  indicatorClassName?: string | undefined;
  label?: ReactNode | undefined;
  labelClassName?: string | undefined;
};

export const Checkbox = forwardRef<HTMLElement, CheckboxProps>(
  ({ children, className, indicatorClassName, label, labelClassName, ...props }, ref) => {
    const control = (
      <BaseCheckbox.Root ref={ref} className={cn("qitu-checkbox", className)} {...props}>
        <BaseCheckbox.Indicator className={cn("qitu-checkbox-indicator", indicatorClassName)}>
          {props.indeterminate ? (
            <Minus aria-hidden="true" size={12} />
          ) : (
            <Check aria-hidden="true" size={12} />
          )}
        </BaseCheckbox.Indicator>
        {children}
      </BaseCheckbox.Root>
    );

    if (!label) {
      return control;
    }

    return (
      <label className={cn("qitu-checkbox-field", labelClassName)}>
        {control}
        <span className="min-w-0">{label}</span>
      </label>
    );
  },
);

Checkbox.displayName = "Checkbox";
