"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";
import dynamic from "next/dynamic";
const AuthModal = dynamic(() => import("./AuthModal"), { ssr: false });

export default function NavAuthButton() {
  const { data: session, status } = useSession();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  if (status === "loading") {
    return (
      <div
        className="h-9 w-20 rounded-lg animate-pulse"
        style={{ background: "var(--surface-container)" }}
        aria-label="Loading authentication status"
      />
    );
  }

  if (status === "authenticated" && session?.user) {
    return (
      <div className="flex items-center gap-3">
        {session.user.image && (
          <Image
            src={session.user.image}
            alt={session.user.name ?? "User avatar"}
            width={32}
            height={32}
            className="rounded-full"
            style={{
              border: "1px solid var(--outline-variant)",
            }}
          />
        )}
        <button
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true);
            signOut();
          }}
          className="text-sm font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed polish-focus-ring"
          style={{
            color: "var(--on-surface-variant)",
            border: "1px solid var(--outline-variant)",
            background: "var(--surface-container-low)",
          }}
        >
          {signingOut ? "Signing Out…" : "Sign Out"}
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setIsAuthModalOpen(true)}
        className="text-sm font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer polish-focus-ring"
        style={{
          color: "var(--on-primary)",
          background: "var(--primary)",
        }}
      >
        Sign In
      </button>
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </>
  );
}
