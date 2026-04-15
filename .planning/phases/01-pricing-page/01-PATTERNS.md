# Phase 1: Pricing Page - Pattern Map

**Mapped:** 2026-04-15
**Files analyzed:** 8 (files to be modified)
**Analogs found:** 8 / 8

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `webapp/src/app/pricing/page.tsx` | component (page) | request-response | itself (rewrite) | exact — same file, same Server Component shell |
| `webapp/src/app/pricing/_components/PricingActions.tsx` | component (client island) | request-response | itself (simplify) | exact — same file, auth-gate pattern kept |
| `webapp/src/lib/analysis/types.ts` | utility (type definition) | transform | itself (edit) | exact |
| `webapp/src/lib/analysis/conversion-model.ts` | utility (pure function) | transform | itself (edit) | exact |
| `webapp/src/lib/analysis/__tests__/tier-gating.test.ts` | test | transform | itself (rewrite) | exact |
| `webapp/src/components/PaywallModal.tsx` | component (modal) | request-response | `webapp/src/components/ui/Modal.tsx` | role-match (Modal shell to keep) |
| `webapp/src/app/analyze/page.tsx` | component (page) | request-response | itself (edit) | exact |
| `webapp/src/app/admin/users/[id]/page.tsx` | component (admin page) | CRUD | itself (edit) | exact |
| `webapp/src/lib/format.ts` | utility | transform | itself (edit) | exact |

---

## Pattern Assignments

### `webapp/src/app/pricing/page.tsx` (Server Component page, request-response)

**Analog:** itself — full rewrite preserving the Server Component shell

**Imports pattern** (lines 1-13, keep these, trim unused icons):
```typescript
import Link from "next/link";
import {
  CheckCircle,
  // keep only icons used by the two new cards
} from "@phosphor-icons/react/dist/ssr";
import Footer from "@/components/Footer";
import Button from "@/components/ui/Button";
import PricingActions from "./_components/PricingActions";
```

**PRICING_TIERS interface pattern** (lines 18-28) — keep the local `PricingTier` interface, trim unused fields (`scans`, or repurpose):
```typescript
interface PricingTier {
  key: string;
  name: string;
  price: number;
  description: string;
  features: { text: string; included: boolean }[];
  icon: React.ReactNode;
  popular?: boolean;
  ctaLabel: string;
}
```

**Card grid pattern** (lines 117-222) — change `lg:grid-cols-4` to `sm:grid-cols-2`, keep card JSX structure:
```tsx
// FROM (line 117):
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">

// TO (2-card layout, max-w-3xl centers it):
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 lg:gap-6 max-w-3xl mx-auto">
```

**Popular badge pattern** (line 129) — adapt to "Coming Soon" for Pro card:
```tsx
// EXISTING "Popular" badge (line 129):
<div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold text-white primary-gradient">
  Popular
</div>

// NEW "Coming Soon" badge for Pro card (muted, no primary-gradient):
<div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]">
  Coming Soon
</div>
```

**Card border/shadow pattern for active vs muted cards** (lines 121-125):
```tsx
// Active Free card — keep brand border:
className={`relative flex flex-col rounded-2xl border bg-[var(--surface-container-lowest)] p-6 sm:p-8 transition-all border-[var(--brand)] shadow-[var(--shadow-brand-md)] ring-2 ring-[var(--brand)]/20`}

// Muted Pro teaser card — outline border + reduced opacity:
className="relative flex flex-col rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-6 sm:p-8 transition-all opacity-70"
```

**Feature list with all-checkmarks pattern** (lines 182-210) — for the Free card, all features get `included: true` (no XCircle rendered):
```tsx
<ul className="space-y-3 mb-8 flex-1">
  {tier.features.map((feature) => (
    <li key={feature.text} className="flex items-start gap-2">
      <CheckCircle
        size={18}
        weight="fill"
        color="var(--success)"
        className="shrink-0 mt-0.5"
      />
      <span className="text-sm text-[var(--on-surface)]">{feature.text}</span>
    </li>
  ))}
</ul>
```

**FAQ/Trust section** (lines 228-242) — replace LemonSqueezy copy entirely:
```tsx
// EXISTING (lines 233-235) — REMOVE:
// "All plans are billed monthly via LemonSqueezy. You can cancel..."

// REPLACE with copy appropriate for free-only model, e.g.:
<p className="text-[var(--on-surface-variant)] mb-8 text-lg">
  Free to start. Pro plan coming soon — join the waitlist to be first.
</p>
```

**PricingActions call pattern** (lines 213-220) — new tier prop shape for Phase 1:
```tsx
// Free card:
<PricingActions tier={{ key: "free", ctaLabel: "Get Started" }} />

// Pro waitlist card:
<PricingActions tier={{ key: "pro-waitlist", ctaLabel: "Join Waitlist" }} />
```

---

### `webapp/src/app/pricing/_components/PricingActions.tsx` (Client island, request-response)

**Analog:** itself — strip LemonSqueezy, keep auth-gate shape

**Imports pattern** (lines 1-11, keep these exactly):
```typescript
"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Button from "@/components/ui/Button";

const AuthModal = dynamic(() => import("@/components/AuthModal"), {
  ssr: false,
});
```

**REMOVE entirely** (lines 13-28): All `LS_STORE_URL`, `LS_VARIANT_*`, `VARIANT_MAP`, and `buildCheckoutUrl` declarations.

**New props interface** (replaces lines 31-38):
```typescript
interface PricingActionsProps {
  tier: {
    key: string;
    ctaLabel: string;
  };
}
```

**Auth-gate core pattern** (lines 44-47, keep these):
```typescript
const { data: session } = useSession();
const isSignedIn = !!session?.user;
const [authModalOpen, setAuthModalOpen] = useState(false);
```

**New waitlist state** (add alongside existing state):
```typescript
const [waitlistConfirmed, setWaitlistConfirmed] = useState(false);
```

**Render branch pattern** — new three-way conditional replacing lines 56-106:
```tsx
// Branch 1: Free tier — static link (keep from line 58-68)
// Branch 2: Pro waitlist + authed → show confirmation or confirmation message
// Branch 3: Pro waitlist + not authed → open AuthModal
{tier.key === "free" ? (
  <Button asChild variant="secondary" size="md" shape="pill" className="w-full text-center">
    <Link href="/">{tier.ctaLabel}</Link>
  </Button>
) : waitlistConfirmed ? (
  <p className="text-sm text-center text-[var(--success)] font-semibold py-3">
    You&apos;re on the list! We&apos;ll notify you.
  </p>
) : (
  <Button
    type="button"
    variant="secondary"
    size="md"
    shape="pill"
    onClick={() => {
      if (!isSignedIn) { setAuthModalOpen(true); return; }
      setWaitlistConfirmed(true); // Phase 3: replace with POST /user/waitlist
    }}
    className="w-full px-8 border border-[var(--outline-variant)] text-[var(--on-surface-variant)]"
  >
    {tier.ctaLabel}
  </Button>
)}
```

**AuthModal call pattern** (lines 108-113, keep as-is):
```tsx
<AuthModal
  isOpen={authModalOpen}
  onClose={() => setAuthModalOpen(false)}
  callbackUrl="/pricing"
/>
```

---

### `webapp/src/lib/analysis/types.ts` (type definition, transform)

**Analog:** itself — single-line edit

**Current** (line 9):
```typescript
export type PlanTier = "free" | "starter" | "growth" | "pro";
```

**Target:**
```typescript
export type PlanTier = "free" | "pro";
```

No other changes to this file.

---

### `webapp/src/lib/analysis/conversion-model.ts` (utility, transform)

**Analog:** itself — targeted edits

**REMOVE** (lines 43-46): `STARTER_DIMENSIONS` constant and its JSDoc. It is exported from `helpers.ts` (line 17) — both the declaration here and the re-export there must be deleted together with the analyze/page.tsx import.

**Rewrite getDimensionAccess** (lines 57-61, currently):
```typescript
// EXISTING:
export function getDimensionAccess(plan: PlanTier, dimensionKey: string): DimensionAccess {
  if (plan === "growth" || plan === "pro") return "unlocked";
  if (plan === "starter" && STARTER_DIMENSIONS.has(dimensionKey)) return "unlocked";
  return "locked";
}
```

**Target** (clean 2-tier logic):
```typescript
export function getDimensionAccess(plan: PlanTier, dimensionKey: string): DimensionAccess {
  if (plan === "pro") return "unlocked";
  return "locked";
}
```

The `dimensionKey` parameter becomes unused; it can be prefixed with `_` (`_dimensionKey`) to satisfy TypeScript/linter, or the signature can be simplified. Keep the parameter to avoid breaking callers.

---

### `webapp/src/lib/analysis/__tests__/tier-gating.test.ts` (test, transform)

**Analog:** itself — rewrite test blocks, keep Vitest import pattern

**Keep** (lines 1-5): import block
```typescript
import { describe, it, expect } from "vitest";
import { getDimensionAccess } from "../conversion-model";
import { ACTIVE_DIMENSIONS } from "../constants";
import type { PlanTier } from "../types";
import type { DimensionAccess } from "../conversion-model";
```

**REMOVE entirely**:
- Lines 11-31: `STARTER_DIMENSIONS` describe block (constant no longer exists)
- Lines 42-55: `starter plan` describe block
- Lines 57-63: `growth plan` describe block
- Lines 79-85: unknown key starter/growth test cases

**Keep and update** `free plan` describe block (lines 34-40) — logic unchanged, still valid.

**Keep and update** `pro plan` describe block (lines 65-70) — still valid.

**New test structure after rewrite**:
```typescript
const ALL_DIMENSION_KEYS = [...ACTIVE_DIMENSIONS];

describe("getDimensionAccess", () => {
  describe("free plan", () => {
    it("returns locked for all 18 active dimensions", () => {
      for (const key of ALL_DIMENSION_KEYS) {
        expect(getDimensionAccess("free", key)).toBe("locked" satisfies DimensionAccess);
      }
    });
  });

  describe("pro plan", () => {
    it("returns unlocked for all 18 active dimensions", () => {
      for (const key of ALL_DIMENSION_KEYS) {
        expect(getDimensionAccess("pro", key)).toBe("unlocked" satisfies DimensionAccess);
      }
    });
  });
});
```

---

### `webapp/src/components/PaywallModal.tsx` (modal component, request-response)

**Analog:** `webapp/src/components/ui/Modal.tsx` — the Modal shell is the pattern to preserve

**REMOVE entirely**:
- Lines 23-26: All `LS_STORE_URL`, `LS_VARIANT_*` env var declarations
- Lines 28-66: `SubscriptionTier` interface and `TIERS` array ($29/$79/$149 data)
- Lines 68-75: `buildCheckoutUrl` function
- Line 96: `isStarter` derived variable
- Lines 142-220: Subscription tier list JSX (the `TIERS.map(...)` block)

**Keep** (Modal shell + header pattern, lines 98-139):
```tsx
// Modal open/close pattern (lines 99-103):
<Modal
  open={isOpen}
  onOpenChange={(v) => !v && onClose()}
  ariaLabel="..."
  className="max-h-[90vh] overflow-y-auto"
>

// Close button pattern (lines 109-120):
<ModalClose>
  <Button type="button" variant="ghost" size="icon" shape="pill"
    className="absolute top-4 right-4 w-11 h-11 ..."
    aria-label="Close">
    <XIcon size={18} weight="bold" />
  </Button>
</ModalClose>

// Header with icon + title (lines 122-139):
<div className="p-6 sm:p-8">
  <div className="text-center mb-6">
    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[var(--brand-light)] border border-[var(--brand-border)]">
      <LockKeyIcon size={28} weight="regular" color="var(--brand)" />
    </div>
    <ModalTitle asChild>
      <h3 className="font-display text-xl font-bold mb-2 text-[var(--text-primary)]">
        Sign up to get full access
      </h3>
    </ModalTitle>
    <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
      Get detailed fixes, actionable recommendations, and step-by-step guides.
    </p>
  </div>
  {/* Phase 2 will add sign-up CTA here */}
</div>
```

**Simplified props interface** (replaces lines 77-84):
```typescript
interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  // userId and analyzedUrl no longer needed (no checkout URL construction)
  // leakKey and userPlan removed — modal is now tier-agnostic
}
```

**Note:** `analyze/page.tsx` currently passes `userId`, `analyzedUrl`, `leakKey`, `userPlan` to `<PaywallModal>`. These props must be removed from both the interface here and the two call sites in analyze/page.tsx simultaneously.

---

### `webapp/src/app/analyze/page.tsx` (client page, request-response)

**Analog:** itself — targeted line edits only

**REMOVE from imports** (line 31-32):
```typescript
// REMOVE these two imports:
STARTER_DIMENSIONS,
// (getDimensionAccess can stay if still used elsewhere in the file)
```

**REMOVE derived variables** (lines 87-93):
```typescript
// REMOVE lines 87-93:
const hasFullAccess = planTier === "growth" || planTier === "pro";
const isStarter = planTier === "starter";
const unlockedCount = hasFullAccess ? 18 : isStarter ? STARTER_DIMENSIONS.size : 0;
```

**REPLACE with** (2-tier derivation):
```typescript
const hasFullAccess = planTier === "pro";
// isStarter removed — no middle tier
// unlockedCount: pro = 18, free = 0 (remove STARTER_DIMENSIONS.size reference)
```

**PaywallModal call sites** — remove props that no longer exist on the simplified interface:
```tsx
// BEFORE (two usages in the file):
<PaywallModal
  isOpen={paywallOpen}
  onClose={() => setPaywallOpen(false)}
  userId={planData?.userId ?? ""}
  analyzedUrl={url}
  leakKey={paywallLeakKey}
  userPlan={planTier}
/>

// AFTER:
<PaywallModal
  isOpen={paywallOpen}
  onClose={() => setPaywallOpen(false)}
/>
```

---

### `webapp/src/app/admin/users/[id]/page.tsx` (admin client page, CRUD)

**Analog:** itself — single-line edit

**Current** (line 35):
```typescript
const PLAN_TIERS = ["free", "starter", "growth", "pro"] as const;
```

**Target:**
```typescript
const PLAN_TIERS = ["free", "pro"] as const;
```

No other changes to this file.

---

### `webapp/src/lib/format.ts` (utility, transform)

**Analog:** itself — remove two switch cases

**Current** `planBadgeStyle` (lines 16-33):
```typescript
export function planBadgeStyle(tier: string): React.CSSProperties {
  switch (tier) {
    case "pro":
      return { background: "var(--brand)", color: "var(--brand-light)" };
    case "growth":
      return { background: "var(--success)", color: "var(--on-primary)" };
    case "starter":
      return { background: "var(--surface-container-high)", color: "var(--text-primary)" };
    default:
      return { background: "var(--surface-container)", color: "var(--text-secondary)" };
  }
}
```

**Target** (remove `growth` and `starter` cases):
```typescript
export function planBadgeStyle(tier: string): React.CSSProperties {
  switch (tier) {
    case "pro":
      return { background: "var(--brand)", color: "var(--brand-light)" };
    default:
      return { background: "var(--surface-container)", color: "var(--text-secondary)" };
  }
}
```

---

## Shared Patterns

### Button Component Usage
**Source:** `webapp/src/components/ui/Button.tsx` (lines 1-91)
**Apply to:** `pricing/page.tsx` (FAQ CTA), `PricingActions.tsx` (both CTAs), `PaywallModal.tsx` (close button)

Key API to copy:
```typescript
<Button
  variant="primary" | "secondary" | "ghost"
  size="md" | "lg" | "icon"
  shape="pill" | "rounded" | "card"
  asChild   // renders as <Link> or other element — use for navigation CTAs
>
```

### Dynamic Import for Client-Only Modals
**Source:** `webapp/src/app/pricing/_components/PricingActions.tsx` (lines 9-11)
**Apply to:** any new modal added in this phase
```typescript
const AuthModal = dynamic(() => import("@/components/AuthModal"), {
  ssr: false,
});
```

### CSS Custom Property Design Tokens
**Source:** Used throughout `pricing/page.tsx` and `PaywallModal.tsx`
**Apply to:** all new/modified UI in this phase

Active card tokens:
```
--brand               border color for featured card
--brand-light         icon background, hover states
--shadow-brand-md     featured card shadow
--surface-container-lowest  card background
```

Muted card tokens (Pro "coming soon"):
```
--outline-variant     border for non-featured cards
--surface-container-high  badge background for "Coming Soon"
--on-surface-variant  muted text color
opacity-70            Tailwind utility for overall card muting
```

### Phosphor Icons Import Pattern
**Source:** `webapp/src/app/pricing/page.tsx` (lines 2-10)
**Apply to:** `pricing/page.tsx` (rewrite)

Server Component pages use the `/dist/ssr` path:
```typescript
import { CheckCircle, Sparkle, RocketLaunch } from "@phosphor-icons/react/dist/ssr";
```

Client Components use the base package:
```typescript
import { XIcon, LockKeyIcon } from "@phosphor-icons/react";
```

### Modal Shell Pattern
**Source:** `webapp/src/components/PaywallModal.tsx` (lines 98-120), `webapp/src/components/ui/Modal.tsx`
**Apply to:** simplified `PaywallModal.tsx`
```tsx
<Modal open={isOpen} onOpenChange={(v) => !v && onClose()} ariaLabel="...">
  <ModalClose>
    <Button type="button" variant="ghost" size="icon" shape="pill" aria-label="Close">
      <XIcon size={18} weight="bold" />
    </Button>
  </ModalClose>
  {/* content */}
</Modal>
```

---

## No Analog Found

All 8 files have direct analogs (the files themselves). No file in this phase is net-new — every change is a modification or simplification of existing code.

---

## Dependency Order (critical for planner)

The TypeScript compiler enforces this — changes must land in this order or builds will fail:

1. `types.ts` — narrow `PlanTier` first; all downstream errors become visible
2. `conversion-model.ts` — remove `STARTER_DIMENSIONS`, simplify `getDimensionAccess`
3. `helpers.ts` — remove `STARTER_DIMENSIONS` re-export (line 17)
4. `format.ts` — remove `growth`/`starter` cases
5. `admin/users/[id]/page.tsx` — update `PLAN_TIERS` array
6. `PaywallModal.tsx` — simplify props interface + remove checkout logic
7. `analyze/page.tsx` — update derivations + PaywallModal call sites
8. `tier-gating.test.ts` — rewrite tests to match new 2-tier model
9. `pricing/page.tsx` — rewrite to 2-card layout (no type dependency, can go first or last)
10. `PricingActions.tsx` — strip LemonSqueezy, add waitlist auth gate

---

## Metadata

**Analog search scope:** `webapp/src/` — all canonical files from CONTEXT.md read directly
**Files scanned:** 9 source files + 1 test file
**Pattern extraction date:** 2026-04-15
