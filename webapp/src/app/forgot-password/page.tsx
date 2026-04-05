"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { API_URL } from "@/lib/api";
import { Input, StatusIcon } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await fetch(`${API_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      // Always show same message regardless of response (no email enumeration)
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again later.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Nav variant="simple" />
      <div className="max-w-md mx-auto px-4 py-16">
        {submitted ? (
          <div className="text-center space-y-5">
            <StatusIcon variant="email" />
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)] mb-2">
                Check Your Email
              </h1>
              <p
                className="text-sm text-[var(--text-secondary)] leading-relaxed"
                role="status"
              >
                If an account exists with that email, we&apos;ve sent a password
                reset link.
              </p>
            </div>
            <Link
              href="/"
              className="inline-block px-6 py-3 rounded-xl text-sm font-semibold text-[var(--brand)] border-[1.5px] border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--surface)] transition-colors polish-hover-lift polish-focus-ring"
            >
              Back to Home
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-xl font-bold text-[var(--text-primary)] mb-1">
                Forgot Password
              </h1>
              <p className="text-sm text-[var(--text-secondary)]">
                Enter your email and we&apos;ll send you a reset link.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Input
                  type="email"
                  required
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-label="Email"
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="cursor-pointer w-full px-6 py-3.5 rounded-xl text-base font-semibold text-white polish-hover-lift polish-focus-ring disabled:opacity-50"
                style={{
                  background: submitting
                    ? "var(--text-tertiary)"
                    : "linear-gradient(135deg, var(--brand), var(--primary-dim))",
                }}
              >
                {submitting ? "Sending…" : "Send Reset Link"}
              </button>

              {error && (
                <p
                  className="text-sm text-center text-[var(--error)] font-medium"
                  role="alert"
                >
                  {error}
                </p>
              )}
            </form>

            <p className="text-sm text-center text-[var(--text-secondary)]">
              Remember your password?{" "}
              <Link
                href="/"
                className="text-[var(--brand)] font-semibold hover:underline polish-focus-ring rounded"
              >
                Sign in
              </Link>
            </p>
          </div>
        )}
      </div>
    </>
  );
}
