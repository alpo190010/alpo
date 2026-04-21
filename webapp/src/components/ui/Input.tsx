import { forwardRef } from "react";

const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className = "", ...props }, ref) => (
  <input
    ref={ref}
    className={`w-full px-4 py-3 text-base rounded-xl outline-none border border-[var(--rule-2)] text-[var(--ink)] bg-[var(--paper)] placeholder:text-[var(--ink-3)] focus:border-[var(--ink)] transition-colors polish-focus-ring ${className}`}
    {...props}
  />
));

Input.displayName = "Input";
export default Input;
