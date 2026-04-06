"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Nav from "@/components/Nav";
import NavAuthButton from "@/components/NavAuthButton";

const adminLinks = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
] as const;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  return (
    <>
      <Nav variant="simple" logoHref="/admin">
        <NavAuthButton />
      </Nav>

      {/* Admin sub-navigation */}
      <div
        className="w-full border-b"
        style={{
          background: "var(--surface-container-lowest)",
          borderColor: "var(--border)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-1" aria-label="Admin navigation">
            {adminLinks.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className="relative px-4 py-3 text-sm font-medium transition-colors polish-focus-ring"
                  style={{
                    color: active
                      ? "var(--brand)"
                      : "var(--text-secondary)",
                  }}
                >
                  {link.label}
                  {active && (
                    <span
                      className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full"
                      style={{ background: "var(--brand)" }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Page content */}
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </>
  );
}
