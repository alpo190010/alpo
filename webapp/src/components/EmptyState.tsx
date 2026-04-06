import { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export default function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div
      className="text-center py-16 rounded-2xl border border-[var(--outline-variant)]"
      style={{ background: "var(--surface-container-lowest)" }}
    >
      <p className="font-display text-lg font-semibold text-[var(--on-surface)] mb-2">
        {title}
      </p>
      <p className="text-sm text-[var(--on-surface-variant)] mb-6">
        {description}
      </p>
      {action}
    </div>
  );
}
