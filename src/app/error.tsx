"use client";

import ErrorCard from "@/components/ErrorCard";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorCard
      error={error}
      reset={reset}
      title="Something went wrong"
      message="We hit an unexpected issue. Please try again — if it persists, try refreshing the page."
    />
  );
}
