"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-fetch";
import { API_URL } from "@/lib/api";

/**
 * Persistent banner shown when an admin is impersonating a user.
 * Mounts globally in the root layout so it appears on every page.
 * Reads impersonation state from localStorage on mount (hydration-safe).
 */
export default function ImpersonationBanner() {
  const router = useRouter();
  const [impersonatedUser, setImpersonatedUser] = useState<{
    id: string;
    email: string;
    name: string | null;
  } | null>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("impersonation_user");
      if (raw) {
        try {
          setImpersonatedUser(JSON.parse(raw));
        } catch {
          // Corrupt data — clear it
          localStorage.removeItem("impersonation_user");
        }
      }
    } catch {
      // localStorage unavailable (private browsing / storage disabled)
    }
  }, []);

  // Re-check on storage events (e.g. when impersonation starts from another tab or same-tab writes)
  useEffect(() => {
    function onStorage() {
      try {
        const raw = localStorage.getItem("impersonation_user");
        if (raw) {
          try {
            setImpersonatedUser(JSON.parse(raw));
          } catch {
            setImpersonatedUser(null);
          }
        } else {
          setImpersonatedUser(null);
        }
      } catch {
        // localStorage unavailable
        setImpersonatedUser(null);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  async function handleExit() {
    setExiting(true);

    // Fire-and-forget: tell the backend impersonation ended
    authFetch(`${API_URL}/admin/stop-impersonation`, {
      method: "POST",
    }).catch((err) => {
      console.warn("Failed to notify backend of impersonation exit:", err);
    });

    // Clear all impersonation state from localStorage
    try {
      localStorage.removeItem("impersonation_token");
      localStorage.removeItem("admin_token_backup");
      localStorage.removeItem("impersonation_user");
    } catch {
      // localStorage unavailable — state is already gone from memory
    }

    setImpersonatedUser(null);
    router.push("/admin/users");
  }

  if (!impersonatedUser) return null;

  const displayName = impersonatedUser.name || impersonatedUser.email;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "var(--warning, #f59e0b)",
        color: "#1a1a1a",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        fontSize: "14px",
        fontWeight: 600,
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      }}
      role="status"
      aria-live="polite"
      data-testid="impersonation-banner"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        style={{ flexShrink: 0 }}
        aria-hidden="true"
      >
        <path
          d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 5zm0 7a.75.75 0 100-1.5.75.75 0 000 1.5z"
          fill="currentColor"
        />
      </svg>
      <span>
        Viewing as <strong>{displayName}</strong>
      </span>
      <button
        type="button"
        disabled={exiting}
        onClick={handleExit}
        style={{
          marginLeft: "4px",
          padding: "4px 14px",
          borderRadius: "8px",
          border: "1.5px solid #1a1a1a",
          background: "transparent",
          color: "#1a1a1a",
          fontSize: "13px",
          fontWeight: 700,
          cursor: exiting ? "not-allowed" : "pointer",
          opacity: exiting ? 0.5 : 1,
          transition: "background 0.15s, opacity 0.15s",
        }}
        onMouseEnter={(e) => {
          if (!exiting)
            (e.currentTarget as HTMLButtonElement).style.background =
              "rgba(0,0,0,0.1)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            "transparent";
        }}
      >
        {exiting ? "Exiting…" : "Exit"}
      </button>
    </div>
  );
}
