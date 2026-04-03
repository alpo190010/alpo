"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { XIcon } from "@phosphor-icons/react";
import { signIn } from "next-auth/react";
import { API_URL } from "@/lib/api";

/* ══════════════════════════════════════════════════════════════
   AuthModal — Sign-in / Sign-up with Google + email/password
   Follows EmailModal pattern: focus trap, escape, backdrop click,
   enter/exit animations, design tokens, aria attrs.
   ══════════════════════════════════════════════════════════════ */

type AuthMode = "signin" | "signup";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Where to redirect after successful sign-in (passed to Google OAuth + credentials flow) */
  callbackUrl?: string;
}

/** Client-side password strength check: 8+ chars, ≥1 letter, ≥1 number */
function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (!/[a-zA-Z]/.test(pw)) return "Password must contain at least one letter";
  if (!/[0-9]/.test(pw)) return "Password must contain at least one number";
  return null;
}

export default function AuthModal({ isOpen, onClose, callbackUrl }: AuthModalProps) {
  const router = useRouter();
  const modalRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [mode, setMode] = useState<AuthMode>("signin");
  const [modalClosing, setModalClosing] = useState(false);

  // Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [passwordHint, setPasswordHint] = useState("");

  // ── Reset state when modal reopens ──
  useEffect(() => {
    if (isOpen) {
      setMode("signin");
      setEmail("");
      setPassword("");
      setName("");
      setError("");
      setSuccess("");
      setPasswordHint("");
      setSubmitting(false);
      setModalClosing(false);
    }
  }, [isOpen]);

  // ── Focus save/restore ──
  useEffect(() => {
    if (!isOpen) return;
    const trigger = document.activeElement;
    return () => {
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, [isOpen]);

  // ── Escape key + focus trap ──
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setModalClosing(true);
        setTimeout(() => {
          setModalClosing(false);
          onCloseRef.current();
        }, 200);
        return;
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  // ── Close with exit animation ──
  function handleClose() {
    setModalClosing(true);
    setTimeout(() => {
      setModalClosing(false);
      onClose();
    }, 200);
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) handleClose();
  }

  // ── Toggle between sign-in and sign-up ──
  function toggleMode() {
    setMode((prev) => (prev === "signin" ? "signup" : "signin"));
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
    setSubmitting(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.ok) {
        handleClose();
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
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Sign Up submit ──
  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const pwError = validatePassword(password);
    if (pwError) {
      setError(pwError);
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: name || undefined }),
      });

      if (res.status === 201) {
        setSuccess("Check your email to verify your account.");
        setEmail("");
        setPassword("");
        setName("");
      } else if (res.status === 409) {
        setError("An account with this email already exists.");
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.detail ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
        modalClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"
      }`}
      style={{
        backgroundColor: "var(--overlay-backdrop)",
        backdropFilter: "blur(4px)",
      }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={mode === "signin" ? "Sign in" : "Create account"}
    >
      <div
        ref={modalRef}
        className={`relative w-full max-w-md bg-[var(--surface)] rounded-3xl overflow-hidden ${
          modalClosing ? "modal-content-exit" : "modal-content-enter"
        }`}
        style={{ boxShadow: "var(--shadow-modal)" }}
      >
        {/* Gradient top bar */}
        <div
          className="h-1 w-full"
          style={{ background: "var(--gradient-primary)" }}
        />

        {/* Close button */}
        <button
          type="button"
          onClick={handleClose}
          className="cursor-pointer absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--bg)] transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          aria-label="Close"
        >
          <XIcon size={16} weight="bold" />
        </button>

        <div className="p-6 sm:p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <h3 className="text-xl font-bold mb-1 text-[var(--text-primary)]">
              {mode === "signin" ? "Sign In" : "Create Account"}
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              {mode === "signin"
                ? "Welcome back! Sign in to your account."
                : "Create a new account to get started."}
            </p>
          </div>

          {/* Google button */}
          <button
            type="button"
            onClick={() => signIn("google", callbackUrl ? { callbackUrl } : undefined)}
            className="cursor-pointer w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border-[1.5px] border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] font-medium text-sm hover:bg-[var(--surface)] transition-colors polish-focus-ring"
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
          </button>

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
            {/* Name field (signup only) */}
            {mode === "signup" && (
              <div className="mb-3">
                <input
                  type="text"
                  placeholder="Name (optional)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="Name"
                  autoComplete="name"
                  className="w-full px-4 py-3.5 text-base rounded-xl outline-none border-[1.5px] border-[var(--border)] text-[var(--text-primary)] bg-[var(--bg)] polish-focus-ring"
                />
              </div>
            )}

            {/* Email field */}
            <div className="mb-3">
              <input
                type="email"
                required
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label="Email"
                autoComplete="email"
                autoFocus
                className="w-full px-4 py-3.5 text-base rounded-xl outline-none border-[1.5px] border-[var(--border)] text-[var(--text-primary)] bg-[var(--bg)] polish-focus-ring"
              />
            </div>

            {/* Password field */}
            <div className="mb-1">
              <input
                type="password"
                required
                placeholder="Password"
                value={password}
                onChange={(e) => handlePasswordChange(e.target.value)}
                aria-label="Password"
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                minLength={8}
                className="w-full px-4 py-3.5 text-base rounded-xl outline-none border-[1.5px] border-[var(--border)] text-[var(--text-primary)] bg-[var(--bg)] polish-focus-ring"
              />
            </div>

            {/* Password validation hint */}
            {passwordHint && (
              <p className="text-xs text-[var(--text-tertiary)] mt-1 mb-2 px-1">
                {passwordHint}
              </p>
            )}
            {!passwordHint && <div className="mb-3" />}

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
              {submitting
                ? "Please wait..."
                : mode === "signin"
                  ? "Sign In"
                  : "Create Account"}
            </button>

            {/* Error message */}
            {error && (
              <p
                className="text-sm mt-3 text-center text-[var(--error)] font-medium"
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
                <button
                  type="button"
                  onClick={toggleMode}
                  className="cursor-pointer text-[var(--brand)] font-semibold hover:underline polish-focus-ring rounded"
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="cursor-pointer text-[var(--brand)] font-semibold hover:underline polish-focus-ring rounded"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
