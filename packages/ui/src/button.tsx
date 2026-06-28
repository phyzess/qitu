import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./utils";

const buttonStyles = cva(
  "qitu-button-press inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] px-3 text-sm font-medium transition-[background,box-shadow,color,transform] duration-300 ease-[var(--ease)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--green)] disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--text)] text-[var(--bg)] shadow-[0_10px_24px_rgba(247,247,248,0.08)] hover:bg-white",
        secondary:
          "bg-[rgb(255_255_255_/_0.055)] text-[var(--text)] shadow-[0_0_0_1px_var(--line)] hover:bg-[rgb(255_255_255_/_0.08)]",
        ghost:
          "bg-transparent text-[var(--muted)] hover:bg-[rgb(255_255_255_/_0.055)] hover:text-[var(--text)]",
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
