"use client";

import Link from "next/link";

interface NavProps {
  variant?: "glassmorphic" | "simple";
  logoText?: string;
  logoHref?: string | false;
  children?: React.ReactNode;
}

export default function Nav({
  variant = "glassmorphic",
  logoText = "Alpo",
  logoHref = "/",
  children,
}: NavProps) {
  const isSimple = variant === "simple";
  const logo = logoHref ? (
    <Link
      href={logoHref}
      className={
        isSimple
          ? "text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]"
          : "text-2xl font-black tracking-tighter font-display"
      }
      style={
        isSimple
          ? undefined
          : {
              color: "var(--nav-logo)",
            }
      }
      {...(isSimple ? { "aria-label": "alpo.ai home" } : {})}
    >
      {logoText}
    </Link>
  ) : (
    <div
      className="text-2xl font-black tracking-tighter font-display"
      style={{
        color: "var(--nav-logo)",
      }}
    >
      {logoText}
    </div>
  );

  if (isSimple) {
    return (
      <nav
        className="w-full h-16 bg-[var(--bg)] border-b border-[var(--border)]"
        aria-label="Main navigation"
      >
        <div className="max-w-2xl mx-auto px-4 h-full flex items-center">
          {logo}
          {children}
        </div>
      </nav>
    );
  }

  return (
    <nav
      className="fixed top-0 w-full z-50 backdrop-blur-xl"
      style={{
        background: "color-mix(in srgb, var(--nav-bg) 80%, transparent)",
        boxShadow: "var(--nav-shadow)",
      }}
      aria-label="Main navigation"
    >
      <div className="flex justify-between items-center w-full px-4 sm:px-8 py-4 max-w-screen-2xl mx-auto">
        {logo}
        {children}
      </div>
    </nav>
  );
}
