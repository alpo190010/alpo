"use client";

import { useState, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import { API_URL } from "@/lib/api";
import { Input, Spinner, StatusIcon } from "@/components/ui";
import { validatePassword } from "@/lib/validators";
import { getUserFriendlyError } from "@/lib/errors";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordHint, setPasswordHint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function handlePasswordChange(value: string) {
    setPassword(value);
    if (value.length > 0) {
      setPasswordHint(validatePassword(value) ?? "");
    } else {
      setPasswordHint("");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    // Client-side validation
    const pwError = validatePassword(password);
    if (pwError) {
      setError(pwError);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!token) {
      setError("Invalid or expired reset link.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (res.ok) {
        setSuccess(true);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.detail ?? "Invalid or expired reset link.");
      }
    } catch {
      setError(getUserFriendlyError(0));
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-5">
        <StatusIcon variant="success" />
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] mb-2">
            Password Reset
          </h1>
          <p
            className="text-sm text-[var(--success)] font-medium"
            role="status"
          >
            Password reset! You can now sign in.
          </p>
        </div>
        <Link
          href="/"
          className="inline-block px-6 py-3 rounded-xl text-sm font-semibold text-white polish-hover-lift polish-focus-ring"
          style={{
            background:
              "linear-gradient(135deg, var(--brand), var(--primary-dim))",
          }}
        >
          Go to Home
        </Link>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-5">
        <StatusIcon variant="error" />
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] mb-2">
            Invalid Link
          </h1>
          <p className="text-sm text-[var(--error)] font-medium" role="alert">
            Invalid or expired reset link.
          </p>
        </div>
        <Link
          href="/forgot-password"
          className="inline-block px-6 py-3 rounded-xl text-sm font-semibold text-[var(--brand)] border-[1.5px] border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--surface)] transition-colors polish-hover-lift polish-focus-ring"
        >
          Request New Link
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-bold text-[var(--text-primary)] mb-1">
            Reset Password
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Enter your new password below.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Input
              type="password"
              required
              placeholder="New password"
              value={password}
              onChange={(e) => handlePasswordChange(e.target.value)}
              aria-label="New password"
              autoComplete="new-password"
              autoFocus
              minLength={8}
            />
            {passwordHint && (
              <p className="text-xs text-[var(--text-tertiary)] mt-1 px-1">
                {passwordHint}
              </p>
            )}
          </div>

          <div>
            <Input
              type="password"
              required
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-label="Confirm new password"
              autoComplete="new-password"
              minLength={8}
            />
          </div>

          <div className="pt-1">
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
              {submitting ? "Resetting…" : "Reset Password"}
            </button>
          </div>

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
    </div>
  );
}

export default function ResetPasswordPage() {
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
        <ResetPasswordContent />
      </Suspense>
    </>
  );
}
