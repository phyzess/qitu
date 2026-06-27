import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./utils";

const buttonStyles = cva(
  "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary: "bg-[var(--color-text)] text-white hover:bg-[var(--color-accent-strong)]",
        secondary:
          "bg-white text-[var(--color-text)] shadow-[var(--shadow-soft)] hover:bg-[var(--color-panel-subtle)]",
        ghost:
          "bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-panel-subtle)] hover:text-[var(--color-text)]",
      },
      size: {
        sm: "h-8 px-2.5 text-xs",
        md: "h-9 px-3 text-sm",
        lg: "h-10 px-4 text-sm",
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
