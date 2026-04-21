import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

/* ── Variant tokens ── */

type CardVariant = "elevated" | "outlined" | "glass";

const variants: Record<CardVariant, string> = {
  elevated: "bg-[var(--paper)] border border-[var(--rule)]",
  outlined: "bg-[var(--paper)] border border-[var(--rule-2)]",
  glass: "glass-card",
};

/* ── Props ── */

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Visual style — default 'elevated' */
  variant?: CardVariant;
  children: ReactNode;
}

/* ── Component ── */

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = "elevated", className = "", children, style, ...props }, ref) => {
    const mergedStyle =
      variant === "elevated"
        ? { boxShadow: "var(--shadow-card, 0 1px 3px rgba(0,0,0,.08))", ...style }
        : style;

    return (
      <div
        ref={ref}
        className={`rounded-xl overflow-hidden ${variants[variant]} ${className}`}
        style={mergedStyle}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = "Card";
export default Card;
export type { CardVariant };
