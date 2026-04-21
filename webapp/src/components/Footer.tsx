export default function Footer() {
  return (
    <footer
      style={{
        background: "var(--nav-bg)",
        borderTop: "1px solid var(--outline-variant)",
      }}
      className="w-full"
    >
      <div className="flex flex-col md:flex-row justify-between items-center w-full px-4 sm:px-8 py-10 sm:py-12 gap-6 max-w-7xl mx-auto">
        <div className="flex flex-col gap-1 text-center md:text-left">
          <div
            className="text-lg font-bold font-display"
            style={{
              color: "var(--primary-dim)",
            }}
          >
            Alpo
          </div>
          <p className="text-[var(--outline)] text-xs tracking-wide uppercase">
            © {new Date().getFullYear()} alpo.ai. All rights reserved.
          </p>
        </div>
        <div className="flex gap-6 sm:gap-8 text-xs tracking-wide uppercase">
          <a
            href="/privacy"
            className="text-[var(--outline)] hover:text-[var(--on-surface-variant)] transition-colors"
          >
            Privacy Policy
          </a>
          <a
            href="/terms"
            className="text-[var(--outline)] hover:text-[var(--on-surface-variant)] transition-colors"
          >
            Terms of Service
          </a>
          <a
            href="/refund"
            className="text-[var(--outline)] hover:text-[var(--on-surface-variant)] transition-colors"
          >
            Refund Policy
          </a>
        </div>
      </div>
    </footer>
  );
}
