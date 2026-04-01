"use client";

import ErrorCard from "@/components/ErrorCard";

export default function ScanError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorCard
      error={error}
      reset={reset}
      title="Something went wrong"
      message="We couldn't load this store scan. The store may be temporarily unreachable."
      secondaryLabel="Try Another URL"
    />
  );
}
