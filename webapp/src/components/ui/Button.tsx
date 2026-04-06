import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from "react";
import { Slot } from "@radix-ui/react-slot";

/* ── Variant / Size / Shape tokens ── */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gradient";
type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon";
type ButtonShape = "rounded" | "pill" | "card";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  /** Render the child element instead of <button>, merging all props onto it. */
  asChild?: boolean;
}

/* ── Base classes ── */

const base =
  "inline-flex items-center justify-center gap-2 font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed polish-focus-ring";

/* ── Variant classes ── */

const variants: Record<ButtonVariant, string> = {
  primary: "primary-gradient text-white hover:scale-[1.02] active:scale-95",
  secondary:
    "border border-[var(--outline-variant)] text-[var(--on-surface)] bg-[var(--surface-container-low)] hover:scale-[1.02] active:scale-95",
  ghost:
    "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-container)] active:scale-95",
  danger: "text-[var(--error)] hover:bg-[var(--error)]/10 active:scale-95",
  gradient: "text-white hover:brightness-110 active:scale-95",
};

/* ── Size classes ── */

const sizes: Record<ButtonSize, string> = {
  xs: "px-3 py-1.5 text-sm",
  sm: "px-5 py-2.5 text-sm",
  md: "px-6 py-3 text-base",
  lg: "px-8 py-4 text-base",
  icon: "w-11 h-11 p-0",
};

/* ── Shape classes ── */

const shapes: Record<ButtonShape, string> = {
  rounded: "rounded-xl",
  pill: "rounded-full",
  card: "rounded-2xl",
};

/* ── Component ── */

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      shape = "rounded",
      asChild = false,
      className = "",
      style,
      ...props
    },
    ref,
  ) => {
    const classes = `${base} ${variants[variant]} ${sizes[size]} ${shapes[shape]} ${className}`;

    // Gradient variant needs an inline style for the CSS custom-property background.
    const mergedStyle: CSSProperties | undefined =
      variant === "gradient"
        ? { background: "var(--gradient-primary)", ...style }
        : style;

    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        className={classes}
        style={mergedStyle}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
export default Button;
export type { ButtonVariant, ButtonSize, ButtonShape };
