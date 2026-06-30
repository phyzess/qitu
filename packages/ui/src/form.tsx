import { Field as BaseField } from "@base-ui/react/field";
import { Input as BaseInput, type InputProps as BaseInputProps } from "@base-ui/react/input";
import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "./utils";

export type InputProps = Omit<BaseInputProps, "className"> & {
  className?: string | undefined;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return <BaseInput ref={ref} className={cn("qitu-field-control", className)} {...props} />;
});

Input.displayName = "Input";

export function TextField(props: {
  className?: string | undefined;
  label: string;
  onChange: (value: string) => void;
  type?: string | undefined;
  value: string;
}) {
  return (
    <BaseField.Root className={cn("qitu-form-field", props.className)}>
      <BaseField.Label className="qitu-form-label">{props.label}</BaseField.Label>
      <Input
        type={props.type ?? "text"}
        value={props.value}
        onValueChange={(value) => props.onChange(value)}
      />
    </BaseField.Root>
  );
}

export function SelectField(props: {
  className?: string | undefined;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <BaseField.Root className={cn("qitu-form-field", props.className)}>
      <BaseField.Label className="qitu-form-label">{props.label}</BaseField.Label>
      <BaseSelect.Root
        items={props.options}
        modal={false}
        value={props.value}
        onValueChange={(value) => {
          if (value !== null) props.onChange(String(value));
        }}
      >
        <BaseSelect.Trigger className="qitu-field-control qitu-select-trigger">
          <BaseSelect.Value>
            {(value) =>
              props.options.find((option) => option.value === value)?.label ?? String(value ?? "")
            }
          </BaseSelect.Value>
          <BaseSelect.Icon className="qitu-select-icon">
            <ChevronDown aria-hidden="true" size={14} />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal>
          <BaseSelect.Positioner className="qitu-overlay-positioner" align="start" sideOffset={6}>
            <BaseSelect.Popup className="qitu-surface qitu-overlay-surface qitu-select-popup">
              <BaseSelect.List className="qitu-select-list">
                {props.options.map((option) => (
                  <BaseSelect.Item
                    className="qitu-panel-action qitu-select-item"
                    key={option.value}
                    label={option.label}
                    value={option.value}
                  >
                    <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                    <BaseSelect.ItemIndicator className="qitu-select-item-indicator">
                      <Check aria-hidden="true" size={14} />
                    </BaseSelect.ItemIndicator>
                  </BaseSelect.Item>
                ))}
              </BaseSelect.List>
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </BaseSelect.Root>
    </BaseField.Root>
  );
}
