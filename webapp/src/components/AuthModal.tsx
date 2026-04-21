"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { XIcon } from "@phosphor-icons/react";
import { signIn } from "next-auth/react";
import { API_URL } from "@/lib/api";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui";
import Modal, { ModalTitle, ModalClose } from "@/components/ui/Modal";
import { validatePassword } from "@/lib/validators";
import { getUserFriendlyError } from "@/lib/errors";

/* ══════════════════════════════════════════════════════════════
   AuthModal — Sign-in / Sign-up with Google + email/password
   Uses shared Modal primitive (Radix Dialog) for focus trap,
   scroll lock, escape key, and enter/exit animations.
   ══════════════════════════════════════════════════════════════ */

type AuthMode = "signin" | "signup";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Where to redirect after successful sign-in (passed to Google OAuth + credentials flow) */
  callbackUrl?: string;
  /** Initial mode when modal opens — defaults to "signin" */
  initialMode?: "signin" | "signup";
  /** Optional custom heading replacing the default "Sign In" / "Create Account" */
  heading?: string;
  /** Optional custom subheading replacing the default welcome/prompt line */
  subheading?: string;
}

export default function AuthModal({ isOpen, onClose, callbackUrl, initialMode = "signin", heading, subheading }: AuthModalProps) {
  const router = useRouter();

  const [mode, setMode] = useState<AuthMode>(initialMode);

  // Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [passwordHint, setPasswordHint] = useState("");

  // ── Reset state when modal reopens ──
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setError("");
      setSuccess("");
      setPasswordHint("");
      setSubmitting(false);
    }
  }, [isOpen, initialMode]);

  // ── Toggle between sign-in and sign-up ──
  function toggleMode() {
    setMode((prev) => (prev === "signin" ? "signup" : "signin"));
    setConfirmPassword("");
    setError("");
    setSuccess("");
    setPasswordHint("");
  }

  // ── Password field change with live validation hint ──
  function handlePasswordChange(value: string) {
    setPassword(value);
    if (value.length > 0) {
      setPasswordHint(validatePassword(value) ?? "");
    } else {
      setPasswordHint("");
    }
  }

  // ── Sign In submit ──
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmedEmail = email.trim();
    if (!trimmedEmail) { setError("Please enter your email."); return; }
    setSubmitting(true);

    try {
      const result = await signIn("credentials", {
        email: trimmedEmail,
        password,
        redirect: false,
      });

      if (result?.ok) {
        onClose();
        if (callbackUrl) {
          router.push(callbackUrl);
        } else {
          router.refresh();
        }
      } else if (result?.code === "EmailNotVerified") {
        setError("Please verify your email before signing in.");
      } else {
        setError("Invalid email or password.");
      }
    } catch {
      setError(getUserFriendlyError(0));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Sign Up submit ──
  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail) { setError("Please enter your email."); return; }

    const pwError = validatePassword(password);
    if (pwError) {
      setError(pwError);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password }),
      });

      if (res.status === 201) {
        setSuccess("Check your email to verify your account.");
        setEmail("");
        setPassword("");
        setConfirmPassword("");
      } else if (res.status === 409) {
        setError("An account with this email already exists.");
      } else {
        const data = await res.json().catch(() => null);
        setError(getUserFriendlyError(res.status, data?.detail));
      }
    } catch {
      setError(getUserFriendlyError(0));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={isOpen}
      onOpenChange={(v) => !v && onClose()}
      ariaLabel={mode === "signin" ? "Sign in" : "Create account"}
    >
        {/* Gradient top bar */}
        <div
          className="h-1 w-full"
          style={{ background: "var(--gradient-primary)" }}
        />

        {/* Close button */}
        <ModalClose>
          <Button
            variant="ghost"
            size="icon"
            shape="pill"
            className="absolute top-4 right-4 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg)]"
            aria-label="Close"
          >
            <XIcon size={18} weight="bold" />
          </Button>
        </ModalClose>

        <div className="p-6 sm:p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <ModalTitle asChild>
              <h3 className="font-display text-xl font-bold mb-1 text-[var(--text-primary)]">
                {heading ?? (mode === "signin" ? "Sign In" : "Create Account")}
              </h3>
            </ModalTitle>
            <p className="text-sm text-[var(--text-secondary)]">
              {subheading ??
                (mode === "signin"
                  ? "Welcome back! Sign in to your account."
                  : "Create a new account to get started.")}
            </p>
          </div>

          {/* Google button */}
          <Button
            variant="secondary"
            size="md"
            disabled={submitting}
            onClick={() => signIn("google", callbackUrl ? { callbackUrl } : undefined)}
            className="w-full border-[1.5px] border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] text-sm hover:bg-[var(--surface)]"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </Button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-xs text-[var(--text-tertiary)] font-medium uppercase tracking-wider">
              or
            </span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          {/* Success message */}
          {success && (
            <div
              className="mb-4 p-3 rounded-xl text-sm text-center font-medium text-[var(--success)] bg-[var(--success-light)] border border-[var(--success-border)]"
              role="alert"
            >
              {success}
            </div>
          )}

          {/* Email/password form */}
          <form onSubmit={mode === "signin" ? handleSignIn : handleSignUp}>
            {/* Email field */}
            <div className="mb-3">
              <Input
                type="email"
                required
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label="Email"
                autoComplete="email"
                autoFocus
                maxLength={254}
              />
            </div>

            {/* Password field */}
            <div className="mb-1">
              <Input
                type="password"
                required
                placeholder="Password"
                value={password}
                onChange={(e) => handlePasswordChange(e.target.value)}
                aria-label="Password"
                aria-describedby={passwordHint ? "password-hint" : undefined}
                aria-invalid={error ? true : undefined}
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                minLength={8}
                maxLength={128}
              />
            </div>

            {/* Password validation hint */}
            {passwordHint && (
              <p id="password-hint" className="text-xs text-[var(--text-tertiary)] mt-1 mb-2 px-1">
                {passwordHint}
              </p>
            )}
            {!passwordHint && <div className="mb-3" />}

            {/* Confirm password field (signup only) */}
            {mode === "signup" && (
              <div className="mb-3">
                <Input
                  type="password"
                  required
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  aria-label="Confirm password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                />
              </div>
            )}

            {/* Forgot password (signin only) */}
            {mode === "signin" && (
              <div className="mb-4 text-right">
                <a
                  href="/forgot-password"
                  className="text-xs text-[var(--brand)] hover:underline polish-focus-ring rounded"
                >
                  Forgot password?
                </a>
              </div>
            )}

            {mode === "signup" && <div className="mb-4" />}

            {/* Submit button */}
            <Button
              type="submit"
              variant="gradient"
              size="md"
              disabled={submitting}
              className="w-full py-3.5 polish-hover-lift"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <span
                    className="w-4 h-4 rounded-full border-2 border-white border-t-transparent inline-block"
                    style={{ animation: "spin 0.8s linear infinite" }}
                  />
                  Please wait...
                </span>
              ) : mode === "signin"
                  ? "Sign In"
                  : "Create Account"}
            </Button>

            {/* Error message */}
            {error && (
              <p
                className="text-sm mt-3 text-center text-[var(--error)] font-medium break-words"
                role="alert"
              >
                {error}
              </p>
            )}
          </form>

          {/* Mode toggle */}
          <p className="text-sm text-center mt-5 text-[var(--text-secondary)]">
            {mode === "signin" ? (
              <>
                Don&apos;t have an account?{" "}
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={toggleMode}
                  className="text-[var(--brand)] font-semibold hover:underline p-0 inline"
                >
                  Create one
                </Button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={toggleMode}
                  className="text-[var(--brand)] font-semibold hover:underline p-0 inline"
                >
                  Sign in
                </Button>
              </>
            )}
          </p>
        </div>
    </Modal>
  );
}
