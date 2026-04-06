"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import { API_URL } from "@/lib/api";
import { Spinner, StatusIcon } from "@/components/ui";
import Button from "@/components/ui/Button";

type VerifyState = "loading" | "success" | "error";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [state, setState] = useState<VerifyState>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("Invalid or expired verification link.");
      return;
    }

    let cancelled = false;

    async function verify() {
      try {
        const res = await fetch(`${API_URL}/auth/verify-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (cancelled) return;

        if (res.ok) {
          setState("success");
          setMessage("Email verified! You can now sign in.");
        } else {
          setState("error");
          const data = await res.json().catch(() => null);
          setMessage(data?.detail ?? "Invalid or expired verification link.");
        }
      } catch {
        if (!cancelled) {
          setState("error");
          setMessage("Something went wrong. Please try again later.");
        }
      }
    }

    verify();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      {state === "loading" && (
        <div className="space-y-4">
          <Spinner />
          <p className="text-[var(--text-secondary)] text-sm font-medium">
            Verifying your email…
          </p>
        </div>
      )}

      {state === "success" && (
        <div className="space-y-5">
          <StatusIcon variant="success" />
          <div>
            <h1 className="font-display text-xl font-bold text-[var(--text-primary)] mb-2">
              Email Verified
            </h1>
            <p
              className="text-sm text-[var(--success)] font-medium"
              role="status"
            >
              {message}
            </p>
          </div>
          <Button asChild variant="gradient">
            <Link href="/">Go to Home</Link>
          </Button>
        </div>
      )}

      {state === "error" && (
        <div className="space-y-5">
          <StatusIcon variant="error" />
          <div>
            <h1 className="font-display text-xl font-bold text-[var(--text-primary)] mb-2">
              Verification Failed
            </h1>
            <p className="text-sm text-[var(--error)] font-medium" role="alert">
              {message}
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/">Go to Home</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <>
      <Nav variant="simple" />
      <Suspense
        fallback={
          <div className="max-w-md mx-auto px-4 py-16 text-center">
            <Spinner />
          </div>
        }
      >
        <VerifyEmailContent />
      </Suspense>
    </>
  );
}
