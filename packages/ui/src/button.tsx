import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./utils";

const buttonStyles = cva(
  "qitu-button-press inline-flex cursor-pointer items-center justify-center gap-[var(--o2)] whitespace-nowrap rounded-[var(--radius-control)] text-[length:var(--text-button-12)] font-medium leading-[var(--leading-button)] transition-[background-color,color,opacity,transform,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 [&>svg]:-translate-y-px [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90",
        secondary: "bg-[var(--surface-row-active)] text-[var(--text)] hover:bg-[var(--accent)]",
        ghost:
          "bg-transparent text-[var(--muted)] hover:bg-[var(--control-hover-bg)] hover:text-[var(--text)]",
      },
      size: {
        sm: "h-7 px-[var(--o3)]",
        md: "h-8 px-[var(--o3)]",
        lg: "h-9 px-[var(--o4)]",
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
