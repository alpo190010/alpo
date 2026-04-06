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
        <p className="text-lg font-semibold text-[var(--on-surface)] mb-2">
          {title}
        </p>
      )}
      <p className={`text-sm text-[var(--error)] font-medium max-w-md mx-auto break-words ${title ? "mb-6" : "mb-4"}`} role="alert">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={disabled}
        className="px-6 py-2.5 rounded-full text-sm font-bold text-white cursor-pointer primary-gradient hover:scale-[1.02] active:scale-95 transition-all polish-focus-ring disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Retry
      </button>
    </div>
  );
}
