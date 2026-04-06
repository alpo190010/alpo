import { forwardRef } from "react";

type ButtonVariant = "primary" | "secondary";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const base =
  "font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed polish-focus-ring";

const variants: Record<ButtonVariant, string> = {
  primary: "primary-gradient text-white hover:scale-[1.02] active:scale-95",
  secondary:
    "border border-[var(--outline-variant)] text-[var(--on-surface)] bg-[var(--surface-container-low)] hover:scale-[1.02] active:scale-95",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", className = "", ...props }, ref) => (
    <button
      ref={ref}
      className={`${base} ${variants[variant]} ${className}`}
      {...props}
    />
  ),
);

Button.displayName = "Button";
export default Button;
