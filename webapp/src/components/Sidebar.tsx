"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";
import {
  House,
  ChartBar,
  CurrencyDollar,
  SignIn,
  SignOut,
  GearSix,
  List,
  X,
  UserCircle,
} from "@phosphor-icons/react";
import { useState, useEffect, useRef } from "react";
import AuthModal from "./AuthModal";
import AlpoLogo from "./AlpoLogo";

/* ══════════════════════════════════════════════════════════════
   Nav items — icon-only on desktop, icon+label on mobile drawer
   ══════════════════════════════════════════════════════════════ */
const NAV_ITEMS = [
  { href: "/", icon: House, label: "Home", auth: false },
  { href: "/dashboard", icon: ChartBar, label: "Dashboard", auth: true },
  { href: "/pricing", icon: CurrencyDollar, label: "Pricing", auth: false },
];

/* ══════════════════════════════════════════════════════════════
   Sidebar — shop.app-style left rail
   Desktop: fixed 64px left rail, always visible
   Mobile: hamburger → slide-out drawer overlay
   ══════════════════════════════════════════════════════════════ */
export default function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* ── Mobile hamburger trigger ── */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 md:hidden flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] shadow-sm cursor-pointer"
        aria-label="Open navigation menu"
      >
        <List size={20} weight="bold" color="var(--on-surface)" />
      </button>

      {/* ── Mobile backdrop ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile drawer ── */}
      <aside
        className={`fixed top-0 left-0 z-[100] h-dvh w-64 bg-[var(--surface-container-lowest)] border-r border-[var(--outline-variant)] shadow-xl flex flex-col transform transition-transform duration-200 ease-out md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Navigation"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--outline-variant)]">
          <Link
            href="/"
            className="text-xl font-black tracking-tighter"
            style={{
              color: "var(--nav-logo)",
              fontFamily: "var(--font-manrope), Manrope, sans-serif",
            }}
          >
            Alpo
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-[var(--surface-container-low)] cursor-pointer"
            aria-label="Close navigation menu"
          >
            <X size={18} weight="bold" color="var(--on-surface-variant)" />
          </button>
        </div>

        {/* Drawer nav items */}
        <nav className="flex-1 flex flex-col gap-1 px-3 py-4">
          {NAV_ITEMS.filter((item) => !item.auth || status === "authenticated").map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? "bg-[var(--surface-container)] text-[var(--on-surface)]"
                    : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)] hover:text-[var(--on-surface)]"
                }`}
              >
                <Icon
                  size={20}
                  weight={active ? "fill" : "regular"}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Drawer footer — auth */}
        <div className="px-3 py-4 border-t border-[var(--outline-variant)]">
          <AuthBlock layout="drawer" session={session} status={status} />
        </div>
      </aside>

      {/* ── Desktop sidebar rail ── */}
      <aside
        className="fixed top-0 left-0 z-40 h-dvh w-16 hidden md:flex flex-col items-center"
        aria-label="Navigation"
      >
        {/* Logo */}
        <Link
          href="/"
          className="flex flex-col items-center"
          aria-label="alpo.ai home"
        >
          <AlpoLogo width={100} height={80} />
          {/*<span*/}
          {/*  className="text-md font-black tracking-tight -mt-4"*/}
          {/*  style={{*/}
          {/*    color: "var(--on-surface-variant)",*/}
          {/*    fontFamily: "var(--font-manrope), Manrope, sans-serif",*/}
          {/*  }}*/}
          {/*>*/}
          {/*  ALPO*/}
          {/*</span>*/}
        </Link>

        {/* Nav icons */}
        <nav className="flex-1 flex flex-col items-center justify-center gap-2">
          {NAV_ITEMS.filter((item) => !item.auth || status === "authenticated").map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex items-center justify-center w-10 h-10 rounded-xl transition-colors ${
                  active
                    ? "bg-[var(--surface-container)] text-[var(--on-surface)]"
                    : "text-[var(--outline)] hover:bg-[var(--surface-container-low)] hover:text-[var(--on-surface-variant)]"
                }`}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={22} weight="fill" />
                {/* Tooltip */}
                <span className="absolute left-full ml-3 px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--inverse-surface)] text-[var(--inverse-on-surface)] whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 shadow-md">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Auth — bottom */}
        <div className="mt-auto py-4">
          <AuthBlock layout="rail" session={session} status={status} />
        </div>
      </aside>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   Auth block — adapts to rail (icon-only) or drawer (full)
   Avatar is clickable → popover with sign out
   ══════════════════════════════════════════════════════════════ */
function AuthBlock({
  layout,
  session,
  status,
}: {
  layout: "rail" | "drawer";
  session: ReturnType<typeof useSession>["data"];
  status: ReturnType<typeof useSession>["status"];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  if (status === "loading") {
    return (
      <div
        className={`animate-pulse rounded-full bg-[var(--surface-container)] ${
          layout === "rail" ? "w-8 h-8" : "w-full h-10"
        }`}
      />
    );
  }

  if (status === "authenticated" && session?.user) {
    const avatar = session.user.image ? (
      <Image
        src={session.user.image}
        alt={session.user.name ?? "User avatar"}
        width={32}
        height={32}
        className="rounded-full border border-[var(--outline-variant)]"
      />
    ) : (
      <div className="w-8 h-8 rounded-full bg-[var(--surface-container)] flex items-center justify-center text-xs font-bold text-[var(--on-surface-variant)]">
        {(session.user.name?.[0] ?? "U").toUpperCase()}
      </div>
    );

    if (layout === "rail") {
      return (
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="cursor-pointer rounded-full hover:ring-2 hover:ring-[var(--outline-variant)] transition-all"
            aria-label="Account menu"
            aria-expanded={menuOpen}
          >
            {avatar}
          </button>
          {menuOpen && (
            <div
              className="absolute left-full bottom-0 ml-3 w-44 rounded-xl bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] py-1"
              style={{ boxShadow: "0 8px 30px rgba(0,0,0,0.12)" }}
            >
              <div className="px-3 py-2 border-b border-[var(--outline-variant)]">
                <p className="text-sm font-medium text-[var(--on-surface)] truncate">{session.user.name}</p>
                <p className="text-xs text-[var(--on-surface-variant)] truncate">{session.user.email}</p>
              </div>
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)] hover:text-[var(--on-surface)] transition-colors"
              >
                <GearSix size={16} weight="regular" />
                Settings
              </Link>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); signOut(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)] hover:text-[var(--error)] transition-colors cursor-pointer"
              >
                <SignOut size={16} weight="regular" />
                Sign out
              </button>
            </div>
          )}
        </div>
      );
    }

    // Drawer layout
    return (
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--surface-container-low)] transition-colors cursor-pointer"
          aria-label="Account menu"
          aria-expanded={menuOpen}
        >
          {avatar}
          <span className="text-sm font-medium text-[var(--on-surface)] truncate flex-1 text-left">{session.user.name}</span>
        </button>
        {menuOpen && (
          <div
            className="absolute left-0 bottom-full mb-2 w-full rounded-xl bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] py-1"
            style={{ boxShadow: "0 8px 30px rgba(0,0,0,0.12)" }}
          >
            <div className="px-3 py-2 border-b border-[var(--outline-variant)]">
              <p className="text-xs text-[var(--on-surface-variant)] truncate">{session.user.email}</p>
            </div>
            <Link
              href="/settings"
              onClick={() => setMenuOpen(false)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)] hover:text-[var(--on-surface)] transition-colors"
            >
              <GearSix size={16} weight="regular" />
              Settings
            </Link>
            <button
              type="button"
              onClick={() => { setMenuOpen(false); signOut(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)] hover:text-[var(--error)] transition-colors cursor-pointer"
            >
              <SignOut size={16} weight="regular" />
              Sign out
            </button>
          </div>
        )}
      </div>
    );
  }

  // Not authenticated
  if (layout === "rail") {
    return (
      <>
        <button
          onClick={() => setAuthModalOpen(true)}
          className="group relative flex flex-col items-center justify-center gap-1 text-[var(--outline)] hover:text-[var(--on-surface-variant)] transition-colors cursor-pointer"
          aria-label="Sign in"
        >
          <UserCircle size={28} weight="regular" />
          <span className="text-[10px] font-medium">Sign in</span>
        </button>
        <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      </>
    );
  }

  // Drawer
  return (
    <>
      <button
        onClick={() => setAuthModalOpen(true)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)] hover:text-[var(--on-surface)] transition-colors cursor-pointer"
      >
        <UserCircle size={20} weight="regular" />
        Sign in
      </button>
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </>
  );
}
