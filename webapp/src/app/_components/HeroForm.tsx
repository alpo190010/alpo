"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { LinkIcon, ArrowRightIcon } from "@phosphor-icons/react";
import { isValidUrl, isProductPageUrl, extractDomain } from "@/lib/analysis/helpers";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export default function HeroForm() {
  const router = useRouter();
  const pathname = usePathname();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset stuck submitting state when navigation bounces back to /
  useEffect(() => {
    if (submitting && pathname === "/") {
      setSubmitting(false);
    }
  }, [pathname, submitting]);

  const handleUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setUrl(e.target.value);
      if (error) setError("");
    },
    [error],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (submitting) return;
      const validUrl = isValidUrl(url);
      if (!validUrl) {
        setError(
          "Please enter a valid URL (e.g. yourstore.com or yourstore.com/products/...)",
        );
        return;
      }
      setSubmitting(true);
      if (isProductPageUrl(validUrl)) {
        router.push(`/analyze?url=${encodeURIComponent(validUrl)}`);
      } else {
        const domain = extractDomain(validUrl) || validUrl;
        router.push(`/scan/${encodeURIComponent(domain)}`);
      }
    },
    [url, submitting, router],
  );

  return (
    <>
      <form id="hero-form" onSubmit={handleSubmit} className="max-w-2xl mx-auto">
        <div className="flex flex-col sm:flex-row p-2 bg-[var(--surface-container-lowest)] rounded-2xl sm:rounded-full shadow-[var(--shadow-subtle)] border border-[var(--outline-variant)]/15 focus-within:border-[var(--brand)]/40 transition-all duration-300">
          <div className="hidden sm:flex items-center pl-6 pr-2 text-[var(--outline)]">
            <LinkIcon size={20} weight="regular" />
          </div>
          <Input
            id="url-input"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="Paste your store or product page URL..."
            value={url}
            onChange={handleUrlChange}
            aria-label="Product page URL"
            maxLength={2048}
            className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-base sm:text-lg placeholder:text-[var(--outline)] px-4 py-3 sm:py-0 text-[var(--on-surface)] rounded-none border-0"
            aria-describedby={error ? "url-error" : undefined}
          />
          <Button
            type="submit"
            variant="primary"
            size="lg"
            shape="pill"
            disabled={submitting}
            className="w-full sm:w-auto px-8 sm:px-10"
          >
            {submitting ? "Loading..." : "Analyze Free"}
            {!submitting && <ArrowRightIcon size={16} weight="bold" />}
          </Button>
        </div>
      </form>

      {error && (
        <div className="max-w-2xl mx-auto mt-4">
          <div
            id="url-error"
            className="p-4 rounded-xl text-sm border-l-4 bg-[var(--error-light)] border-l-[var(--error)] border border-[var(--error-border-light)]"
            role="alert"
          >
            <span className="text-[var(--error)] font-medium">{error}</span>
          </div>
        </div>
      )}
    </>
  );
}
