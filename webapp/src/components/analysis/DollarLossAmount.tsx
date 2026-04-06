/* ══════════════════════════════════════════════════════════════
   DollarLossAmount — Red-highlighted dollar figure with consistent
   formatting. Pure component, no state.

   Usage:
     <DollarLossAmount value={464.44} />
     <DollarLossAmount value={464.44} className="text-[var(--accent)]" />
   ══════════════════════════════════════════════════════════════ */

interface DollarLossAmountProps {
  /** Dollar amount (must be > 0 for meaningful display). */
  value: number;
  /** Override the text color class. Default: "text-[var(--accent)]". */
  className?: string;
}

export default function DollarLossAmount({
  value,
  className = "text-[var(--accent)]",
}: DollarLossAmountProps) {
  return (
    <span className={className}>
      ~${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}
