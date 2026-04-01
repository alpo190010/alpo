"use client";

import ErrorCard from "@/components/ErrorCard";

export default function ReportError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorCard
      error={error}
      reset={reset}
      title="Report Unavailable"
      message="This report couldn't be loaded. It may have expired or the link may be incorrect."
    />
  );
}
