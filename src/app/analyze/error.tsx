"use client";

import ErrorCard from "@/components/ErrorCard";

export default function AnalyzeError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorCard
      error={error}
      reset={reset}
      title="Analysis Failed"
      message="Something went wrong during the analysis. The page may be temporarily unreachable or behind a login."
      secondaryLabel="Try Another URL"
    />
  );
}
