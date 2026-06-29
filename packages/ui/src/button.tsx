import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./utils";

const buttonStyles = cva(
  "qitu-button-press inline-flex cursor-pointer items-center justify-center gap-[var(--qitu-space-o2)] whitespace-nowrap rounded-[var(--qitu-radius-control)] text-[length:var(--qitu-text-button-12)] font-medium leading-[var(--qitu-leading-button)] transition-[background-color,color,opacity,transform,box-shadow] duration-[var(--qitu-motion-fast)] ease-[var(--qitu-ease-standard)] select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--qitu-color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--qitu-bg)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 [&>svg]:-translate-y-px [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--qitu-color-primary)] text-[var(--qitu-color-primary-foreground)] hover:opacity-90",
        secondary:
          "bg-[var(--qitu-surface-row-active)] text-[var(--qitu-text)] hover:bg-[var(--qitu-color-accent)]",
        ghost:
          "bg-transparent text-[var(--qitu-muted)] hover:bg-[var(--qitu-control-hover-bg)] hover:text-[var(--qitu-text)]",
      },
      size: {
        sm: "h-7 px-[var(--qitu-space-o3)]",
        md: "h-8 px-[var(--qitu-space-o3)]",
        lg: "h-9 px-[var(--qitu-space-o4)]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonStyles>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size, variant, ...props }, ref) => {
    return (
      <button ref={ref} className={cn(buttonStyles({ size, variant }), className)} {...props} />
    );
  },
);

Button.displayName = "Button";
