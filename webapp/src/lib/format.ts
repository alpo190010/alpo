export function formatDate(
  iso: string | null,
  opts?: { includeYear?: boolean },
): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
    const fmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    if (opts?.includeYear !== false) fmt.year = "numeric";
    return d.toLocaleDateString("en-US", fmt);
  } catch {
    return "—";
  }
}

export function planBadgeStyle(tier: string): React.CSSProperties {
  switch (tier) {
    case "pro":
      return { background: "var(--brand)", color: "var(--brand-light)" };
    case "starter":
      return { background: "var(--accent-soft)", color: "var(--accent-dim)" };
    default:
      return {
        background: "var(--surface-container)",
        color: "var(--text-secondary)",
      };
  }
}

export function roleBadgeStyle(role: string): React.CSSProperties {
  if (role === "admin") {
    return { background: "var(--brand)", color: "var(--brand-light)" };
  }
  return {
    background: "var(--surface-container)",
    color: "var(--text-secondary)",
  };
}

export function waitlistBadgeStyle(): React.CSSProperties {
  return {
    background: "#84cc16",
    color: "#3f6212",
  };
}
