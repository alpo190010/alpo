"use client";

import { useState, useEffect, FormEvent } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { API_URL } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import { Input, Spinner } from "@/components/ui";
import { validatePassword } from "@/lib/validators";
import { getUserFriendlyError } from "@/lib/errors";
import ErrorState from "@/components/ErrorState";

/* ══════════════════════════════════════════════════════════════
   /settings — Account settings with profile + password management
   Protected by proxy.ts (unauthenticated users redirect to /).
   ══════════════════════════════════════════════════════════════ */

interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  picture: string | null;
  has_password: boolean;
  google_linked: boolean;
  email_verified: boolean;
}

export default function SettingsPage() {
  const { status } = useSession();
  const router = useRouter();

  // Profile state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordHint, setPasswordHint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch profile once session is authenticated
  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.replace("/");
      return;
    }

    const controller = new AbortController();

    async function fetchProfile() {
      try {
        const res = await authFetch(`${API_URL}/auth/me`, { signal: controller.signal });
        if (!res.ok) {
          throw new Error("Failed to load profile");
        }
        const data: UserProfile = await res.json();
        setProfile(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setFetchError("Could not load your profile. Please try again.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchProfile();
    return () => controller.abort();
  }, [status, router, retryKey]);

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
    setError(null);
    setSuccess(null);

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

    if (profile?.has_password && !currentPassword) {
      setError("Please enter your current password.");
      return;
    }

    setSubmitting(true);

    try {
      const isSetPassword = !profile?.has_password;
      const endpoint = isSetPassword
        ? `${API_URL}/auth/set-password`
        : `${API_URL}/auth/change-password`;
      const body = isSetPassword
        ? { password }
        : { current_password: currentPassword, new_password: password };

      const res = await authFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSuccess(
          isSetPassword
            ? "Password set successfully!"
            : "Password changed successfully!",
        );
        setCurrentPassword("");
        setPassword("");
        setConfirmPassword("");
        setPasswordHint("");
        // Update local profile so the form switches to "Change Password"
        if (isSetPassword && profile) {
          setProfile({ ...profile, has_password: true });
        }
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
    <>
      <Nav variant="simple" />
      <main className="max-w-lg mx-auto px-4 py-12">
        {/* Loading spinner */}
        {loading && (
          <div className="text-center py-16">
            <Spinner />
          </div>
        )}

        {/* Fetch error */}
        {fetchError && !loading && (
          <ErrorState
            message={fetchError}
            disabled={loading}
            onRetry={() => {
              setFetchError(null);
              setLoading(true);
              setRetryKey((k) => k + 1);
            }}
          />
        )}

        {/* Profile loaded */}
        {profile && !loading && (
          <div className="space-y-8">
            {/* Page heading */}
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)] mb-1">
                Account Settings
              </h1>
              <p className="text-sm text-[var(--text-secondary)]">
                Manage your profile and security settings.
              </p>
            </div>

            {/* Profile section */}
            <section
              className="rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--surface-container)] p-5 space-y-4"
              aria-labelledby="profile-heading"
            >
              <h2
                id="profile-heading"
                className="text-base font-semibold text-[var(--text-primary)]"
              >
                Profile
              </h2>

              <div className="space-y-3">
                <div>
                  <span className="block text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">
                    Name
                  </span>
                  <span className="text-sm text-[var(--text-primary)]">
                    {profile.name || "—"}
                  </span>
                </div>
                <div>
                  <span className="block text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">
                    Email
                  </span>
                  <span className="text-sm text-[var(--text-primary)]">
                    {profile.email}
                  </span>
                </div>
              </div>

              {/* Google link status */}
              {profile.google_linked && (
                <div className="flex items-center gap-2 pt-1">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--success)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span className="text-sm font-medium text-[var(--success)]">
                    Google connected
                  </span>
                </div>
              )}
            </section>

            {/* Password section */}
            <section
              className="rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--surface-container)] p-5 space-y-4"
              aria-labelledby="password-heading"
            >
              <h2
                id="password-heading"
                className="text-base font-semibold text-[var(--text-primary)]"
              >
                {profile.has_password ? "Change Password" : "Set Password"}
              </h2>
              {!profile.has_password && (
                <p className="text-sm text-[var(--text-secondary)]">
                  Your account uses Google sign-in. Set a password to also sign
                  in with email.
                </p>
              )}

              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Current password (only for users who already have one) */}
                {profile.has_password && (
                  <div>
                    <Input
                      type="password"
                      required
                      placeholder="Current password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      aria-label="Current password"
                      autoComplete="current-password"
                      maxLength={128}
                    />
                  </div>
                )}

                {/* New password */}
                <div>
                  <Input
                    type="password"
                    required
                    placeholder="New password"
                    value={password}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    aria-label="New password"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                  />
                  {passwordHint && (
                    <p className="text-xs text-[var(--text-tertiary)] mt-1 px-1">
                      {passwordHint}
                    </p>
                  )}
                </div>

                {/* Confirm password */}
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
                    maxLength={128}
                  />
                </div>

                {/* Submit */}
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
                    {submitting
                      ? "Saving…"
                      : profile.has_password
                        ? "Change Password"
                        : "Set Password"}
                  </button>
                </div>

                {/* Success message */}
                {success && (
                  <p
                    className="text-sm text-center text-[var(--success)] font-medium"
                    role="status"
                  >
                    {success}
                  </p>
                )}

                {/* Error message */}
                {error && (
                  <p
                    className="text-sm text-center text-[var(--error)] font-medium break-words"
                    role="alert"
                  >
                    {error}
                  </p>
                )}
              </form>
            </section>
          </div>
        )}
      </main>
    </>
  );
}
}
