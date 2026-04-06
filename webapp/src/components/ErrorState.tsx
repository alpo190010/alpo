import Button from "@/components/ui/Button";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry: () => void;
  disabled?: boolean;
}

export default function ErrorState({ title, message, onRetry, disabled }: ErrorStateProps) {
  return (
    <div
      className="text-center py-12 rounded-2xl border border-[var(--outline-variant)]"
      style={{ background: "var(--surface-container-lowest)" }}
    >
      {title && (
        <p className="font-display text-lg font-semibold text-[var(--on-surface)] mb-2">
          {title}
        </p>
      )}
      <p className={`text-sm text-[var(--error)] font-medium max-w-md mx-auto break-words ${title ? "mb-6" : "mb-4"}`} role="alert">
        {message}
      </p>
      <Button
        type="button"
        variant="primary"
        size="sm"
        shape="pill"
        onClick={onRetry}
        disabled={disabled}
        className="px-6"
      >
        Retry
      </Button>
    </div>
  );
}
