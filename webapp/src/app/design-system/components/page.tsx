"use client";

import { useState } from "react";
import {
  StorefrontIcon,
  ArrowRightIcon,
  StarIcon,
  ShieldCheckIcon,
  LightningIcon,
  TruckIcon,
  CheckCircleIcon,
  HouseIcon,
  ChartBarIcon,
  CoinIcon,
  UserIcon,
  CaretDownIcon,
  CaretRightIcon,
} from "@phosphor-icons/react";
import DsHeader, {
  DsSection,
  DsSubhead,
} from "../_components/DsHeader";
import ComponentStage, { TokenCode } from "../_components/ComponentStage";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { PlanBadge, RoleBadge, WaitlistBadge } from "@/components/ui/MetaBadges";
import UrlInput from "@/components/ui/UrlInput";

/* DS · 02 — Components.
   Renders every primitive from @/components/ui + reproducible mocks of the
   larger compositions (issue card, group header, CTA card, sidebar rail).
   All samples render the real components so edits propagate automatically. */

const sections = [
  { href: "#buttons", label: "Buttons" },
  { href: "#inputs", label: "Inputs" },
  { href: "#chips", label: "Chips" },
  { href: "#ring", label: "Score ring" },
  { href: "#issue", label: "Issue cards" },
  { href: "#group", label: "Group header" },
  { href: "#sh", label: "Store health" },
  { href: "#product", label: "Product card" },
  { href: "#cta", label: "CTA card" },
  { href: "#rail", label: "Sidebar rail" },
];

export default function ComponentsPage() {
  const [url, setUrl] = useState("gymshark.com");

  return (
    <>
      <DsHeader
        eyebrow="Alpo Design System · 02"
        title={<>Components</>}
        lede="The full kit — every element used across the landing page, scan page, and results view. Each stage below demonstrates default state and lists the tokens it pulls from."
        activeHref="/design-system/components"
        sections={sections}
      />

      {/* BUTTONS */}
      <DsSection
        id="buttons"
        title="Buttons"
        lede="Ink-filled primary is the default CTA everywhere. Coral fills only for urgent actions (critical tier). Ghost and secondary for supporting actions."
      >
        <ComponentStage
          name="Primary CTA · Large"
          sub="Landing hero, Run Deep Analysis, Analyze Again."
          tokens={{
            Fill: <TokenCode>--ink</TokenCode>,
            Text: <TokenCode>--paper</TokenCode>,
            Radius: "999px",
            Shadow: "brand-md",
          }}
          note={
            <>
              Hover: <TokenCode>translateY(-1px)</TokenCode>, opacity .94
            </>
          }
        >
          <Button variant="primary" size="lg">
            Scan My Store
          </Button>
        </ComponentStage>

        <ComponentStage
          name="Primary · Medium"
          sub="Inline CTAs, form submits."
          tokens={{ Padding: "11 · 22", Font: "14 · 500" }}
        >
          <Button variant="primary" size="md">
            View Results
          </Button>
        </ComponentStage>

        <ComponentStage
          name="Coral · Critical action"
          sub="Use sparingly — only for destructive or urgent flows."
          tokens={{
            Fill: <TokenCode>--accent</TokenCode>,
            Hover: <TokenCode>--accent-dim</TokenCode>,
          }}
        >
          <Button variant="coral" size="md">
            Fix Critical Issue
          </Button>
        </ComponentStage>

        <ComponentStage
          name="Secondary & Ghost"
          tokens={{
            Secondary: "paper + rule border",
            Ghost: "transparent + hover bg",
          }}
        >
          <div className="flex gap-3">
            <Button variant="secondary" size="md">
              See pricing
            </Button>
            <Button variant="ghost" size="md">
              Dismiss
            </Button>
          </div>
        </ComponentStage>

        <ComponentStage
          name="On-dark"
          sub="White pill for CTAs inside the dark dollar-loss card."
          stageStyle={{
            background: "linear-gradient(145deg, #1a1712, #2a241c)",
          }}
          tokens={{
            Fill: "#fff",
            Text: <TokenCode>--ink</TokenCode>,
            Weight: "700",
          }}
        >
          <Button variant="on-dark" size="md">
            Connect Your Store
          </Button>
        </ComponentStage>
      </DsSection>

      {/* INPUTS */}
      <DsSection
        id="inputs"
        title="Inputs"
        lede="The URL pill is the only input in the product today — clean, one-line, pill-shaped."
      >
        <ComponentStage
          name="URL pill"
          sub="Hero input, scan page header."
          tokens={{
            Bg: <TokenCode>--paper</TokenCode>,
            Border: <TokenCode>--rule-2</TokenCode>,
            Radius: "999px",
            Shadow: "subtle",
          }}
        >
          <form
            onSubmit={(e) => e.preventDefault()}
            className="w-full flex justify-center"
          >
            <UrlInput
              value={url}
              onValueChange={setUrl}
              ctaLabel="Scan"
            />
          </form>
        </ComponentStage>
      </DsSection>

      {/* CHIPS */}
      <DsSection
        id="chips"
        title="Chips & badges"
        lede="Scores, states, and metadata get pill chips. Scope badges are a muted rounded-rect in mono — they label things, not actions."
      >
        <ComponentStage
          name="Score chips"
          sub="Used on product cards and above the score ring."
          tokens={{
            Font: "Serif 800 · 10",
            Pad: "4 · 10",
            Radius: "999px",
          }}
        >
          <div className="flex flex-wrap gap-2.5">
            <Badge variant="ok">Good · 82</Badge>
            <Badge variant="warn">Needs work · 42</Badge>
            <Badge variant="err">Critical · 15</Badge>
            <Badge variant="muted">Ready to scan</Badge>
          </div>
        </ComponentStage>

        <ComponentStage
          name="Scanning chip"
          sub="Appears on product cards mid-scan."
          tokens={{ Spinner: "1.5px ink border" }}
        >
          <Badge variant="scanning" />
        </ComponentStage>

        <ComponentStage
          name="Metadata badges"
          sub="Plan / role / waitlist labels on admin screens."
          tokens={{ Font: "Mono 700 · 10", Bg: "tier-specific" }}
        >
          <div className="flex flex-wrap gap-2.5">
            <PlanBadge tier="fixes" />
            <PlanBadge tier="insights" />
            <PlanBadge tier="free" />
            <RoleBadge role="admin" />
            <WaitlistBadge />
          </div>
        </ComponentStage>
      </DsSection>

      {/* SCORE RING */}
      <DsSection
        id="ring"
        title="Score ring"
        lede="The hero metric. Stroke color follows score tier. Progress is animated from 0 on reveal."
      >
        <ComponentStage
          name="Score ring · 3 tiers"
          sub="112×112. Stroke width 8. Starts at top (−90° rotation), stroke-linecap round."
          tokens={{
            Track: <TokenCode>--bg-elev</TokenCode>,
            Good: <TokenCode>--success-text</TokenCode>,
            Warn: <TokenCode>--warning-text</TokenCode>,
            Crit: <TokenCode>--error</TokenCode>,
          }}
          note={
            <>
              Animate: <TokenCode>stroke-dashoffset</TokenCode> 0 → (352 −
              352·score/100)
            </>
          }
        >
          <div className="flex gap-12 justify-center">
            <ScoreRingSample score={82} stroke="var(--success-text)" />
            <ScoreRingSample score={42} stroke="var(--warning-text)" />
            <ScoreRingSample score={15} stroke="var(--accent)" />
          </div>
        </ComponentStage>
      </DsSection>

      {/* ISSUE CARDS */}
      <DsSection
        id="issue"
        title="Issue cards"
        lede="The fundamental content unit on the results page. Icon tile + score block on top, serif title + clamped problem body, conversion-loss footer. Hover lifts 2px and darkens the border."
      >
        <ComponentStage
          name="Issue card · default"
          sub="Renders in a 1- or 2-col grid inside a group body."
          tokens={{
            Radius: "18px",
            Pad: "18px",
            Bg: <TokenCode>--paper</TokenCode>,
            Border: "rule@50%",
            "Icon tile": "40×40 · r14",
          }}
          note={
            <>
              Hover: border → <TokenCode>--ink@35%</TokenCode>,{" "}
              <TokenCode>translateY(-2px)</TokenCode>
            </>
          }
        >
          <IssueCardSample
            icon={<StarIcon size={20} weight="fill" />}
            score={15}
            scoreColor="var(--accent)"
            title="Reviews & Social Proof"
            body="No visible reviews. Going from 0→5 reviews delivers a 270% conversion lift on average."
            loss="~10.2%"
          />
        </ComponentStage>

        <ComponentStage
          name="Issue card · store-wide"
          sub="Adds the scope badge inline with the title."
        >
          <IssueCardSample
            icon={<ShieldCheckIcon size={20} weight="fill" />}
            score={30}
            scoreColor="var(--accent)"
            title="Trust & Guarantees"
            scopeBadge
            body="No money-back guarantee, no phone number, no security badges near Add to Cart."
            loss="~8.4%"
          />
        </ComponentStage>
      </DsSection>

      {/* GROUP HEADER */}
      <DsSection
        id="group"
        title="Group header"
        lede="Collapsible shelf above each row of issue cards. Avg score pill left, label + count + loss right, chevron rotates when collapsed."
      >
        <ComponentStage
          name="Group header"
          sub="Score pill uses tinted bg + matching text color. Chevron rotates −90° when collapsed."
          tokens={{ Pill: "44×44 · r12", Gap: "14" }}
        >
          <GroupHeaderSample />
        </ComponentStage>
      </DsSection>

      {/* STORE HEALTH */}
      <DsSection
        id="sh"
        title="Store-health row"
        lede="Compact dimension row used in the left sidebar Store Health card. 24×24 icon tile, label, small numeric pill, chevron."
      >
        <ComponentStage
          name="Store-health row · 3 tiers"
          flow
          tokens={{
            Height: "40 · pad 8·10",
            Icon: "24×24 · r12",
          }}
        >
          <StoreHealthRow
            icon={<LightningIcon size={14} weight="fill" />}
            label="Page Speed"
            score={45}
            tier="err"
          />
          <StoreHealthRow
            icon={<TruckIcon size={14} weight="fill" />}
            label="Shipping Transparency"
            score={55}
            tier="warn"
          />
          <StoreHealthRow
            icon={<CheckCircleIcon size={14} weight="fill" />}
            label="Accessibility"
            score={78}
            tier="ok"
          />
        </ComponentStage>
      </DsSection>

      {/* PRODUCT CARD */}
      <DsSection
        id="product"
        title="Product card"
        lede="Product list item on the scan page. Round thumbnail with brand-tinted gradient + score overlay when analyzed. Three chip states: ready, scanning, scored."
      >
        <ComponentStage
          name="Product card · 3 states"
          flow
          tokens={{
            Thumb: "64×64 · round",
            Selected: "border → ink",
            Radius: "16px",
          }}
          note={
            <>
              Scored thumb overlay:{" "}
              <TokenCode>color-mix(in oklch, tier-color 55%, transparent)</TokenCode>
            </>
          }
        >
          <ProductCard
            selected
            initials="GS"
            name='Arrival 5" Shorts'
            score={42}
            state="scored"
          />
          <ProductCard
            initials="AS"
            gradient="linear-gradient(135deg,#46352b,#261812)"
            name="Apex Seamless Tank"
            state="scanning"
          />
          <ProductCard
            initials="PL"
            gradient="linear-gradient(135deg,#1f1c18,#100d0a)"
            name="Power Lifting Belt"
            state="ready"
          />
        </ComponentStage>
      </DsSection>

      {/* CTA CARD */}
      <DsSection
        id="cta"
        title="Dollar-loss CTA card"
        lede="The dark card on the results page. Coral italic is reserved for the dollar amount — it's the only coral surface on the whole page."
      >
        <ComponentStage
          name="Dollar-loss CTA"
          sub="Gradient dark background + subtle diagonal texture at 3.5% opacity."
          stageStyle={{ background: "var(--bg)" }}
          tokens={{
            Bg: "linear 145° · #1a1712 → #2a241c → #16130e",
            Accent: <TokenCode>--accent</TokenCode>,
            Button: "white pill",
            Radius: "20px",
          }}
        >
          <DollarLossCtaSample />
        </ComponentStage>
      </DsSection>

      {/* SIDEBAR RAIL */}
      <DsSection
        id="rail"
        title="Sidebar rail"
        lede="Fixed 64px rail on the left of the scan and dashboard views. Logo top, nav middle, auth bottom. Active item is bg-elev."
      >
        <ComponentStage
          name="Sidebar rail"
          stageStyle={{ background: "var(--bg-elev)" }}
          tokens={{
            Width: "64px fixed",
            Item: "40×40 · r12",
            Active: <TokenCode>--bg-elev</TokenCode>,
          }}
        >
          <SidebarRailSample />
        </ComponentStage>
      </DsSection>
    </>
  );
}

/* ─────────────────────── Inline samples ─────────────────────── */

function ScoreRingSample({ score, stroke }: { score: number; stroke: string }) {
  const offset = 352 - (352 * score) / 100;
  return (
    <div className="relative w-28 h-28">
      <svg
        viewBox="0 0 128 128"
        className="w-full h-full"
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx="64"
          cy="64"
          r="56"
          fill="transparent"
          stroke="var(--bg-elev)"
          strokeWidth="8"
        />
        <circle
          cx="64"
          cy="64"
          r="56"
          fill="transparent"
          stroke={stroke}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray="352"
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-serif font-extrabold text-[36px] leading-none tracking-[-0.02em] text-[var(--ink)]"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {score}
        </span>
        <span className="text-[8px] font-bold uppercase tracking-[0.15em] text-[var(--ink-3)] opacity-50 mt-0.5">
          /100
        </span>
      </div>
    </div>
  );
}

function IssueCardSample({
  icon,
  score,
  scoreColor,
  title,
  scopeBadge,
  body,
  loss,
}: {
  icon: React.ReactNode;
  score: number;
  scoreColor: string;
  title: string;
  scopeBadge?: boolean;
  body: string;
  loss: string;
}) {
  return (
    <article className="w-full max-w-[380px] bg-[var(--paper)] border border-[color:color-mix(in_oklch,var(--rule-2)_50%,transparent)] rounded-[18px] p-[18px] shadow-[var(--shadow-subtle)] transition-all hover:border-[color:color-mix(in_oklch,var(--ink)_35%,transparent)] hover:-translate-y-0.5">
      <div className="flex justify-between items-start mb-3.5">
        <div className="w-10 h-10 rounded-[14px] bg-[var(--bg-elev)] flex items-center justify-center text-[var(--ink-2)]">
          {icon}
        </div>
        <div className="text-right">
          <div className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-[var(--ink-3)]">
            Score
          </div>
          <div
            className="font-serif font-extrabold text-[20px] leading-[1.1]"
            style={{ color: scoreColor }}
          >
            {score}
            <small className="text-[11px] font-semibold opacity-50 ml-0.5">
              /100
            </small>
          </div>
        </div>
      </div>
      <h3 className="font-serif font-bold text-[15px] leading-[1.3] m-0 mb-1.5 flex items-center gap-2 flex-wrap text-[var(--ink)]">
        {title}
        {scopeBadge && (
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded bg-[var(--rule-2)] text-[var(--ink-2)]">
            Store-wide
          </span>
        )}
      </h3>
      <p className="text-[13px] text-[var(--ink-2)] leading-[1.5] m-0 line-clamp-3">
        {body}
      </p>
      <div className="flex justify-between items-center gap-3 mt-4 pt-3.5 border-t border-[var(--bg-elev)]">
        <div>
          <div className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-[var(--ink-3)] whitespace-nowrap">
            Est. Conversion Loss
          </div>
          <div className="font-serif font-extrabold text-[15px] text-[var(--warning-text)] mt-0.5 whitespace-nowrap">
            {loss}
          </div>
        </div>
        <CaretRightIcon
          size={18}
          weight="bold"
          className="text-[var(--ink-3)] shrink-0"
        />
      </div>
    </article>
  );
}

function GroupHeaderSample() {
  return (
    <button className="w-full max-w-[560px] flex items-center gap-3.5 p-3 rounded-xl bg-[var(--paper)] border border-[var(--rule-2)] text-left">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center font-serif font-extrabold text-sm shrink-0"
        style={{
          background: "var(--error-light)",
          color: "var(--accent)",
        }}
      >
        25
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="font-serif font-bold text-[16px] text-[var(--ink)] m-0 leading-[1.3]">
            Trust &amp; Transparency
          </h3>
          <span className="text-[11px] text-[var(--ink-3)] font-semibold">
            3 issues
          </span>
          <span className="ml-auto font-serif font-bold text-[11px] text-[var(--warning-text)]">
            ~8.4% conversion loss
          </span>
        </div>
        <p className="text-[11px] text-[var(--ink-3)] mt-0.5 m-0">
          Do shoppers believe you?
        </p>
      </div>
      <CaretDownIcon
        size={14}
        weight="bold"
        className="text-[var(--ink-3)]"
      />
    </button>
  );
}

function StoreHealthRow({
  icon,
  label,
  score,
  tier,
}: {
  icon: React.ReactNode;
  label: string;
  score: number;
  tier: "ok" | "warn" | "err";
}) {
  const style =
    tier === "ok"
      ? {
          background: "var(--success-light)",
          color: "var(--success-text)",
        }
      : tier === "warn"
        ? {
            background: "var(--warning-light)",
            color: "var(--warning-text)",
          }
        : { background: "var(--error-light)", color: "var(--accent)" };

  return (
    <div className="w-full max-w-[400px] flex items-center gap-2 rounded-xl px-2.5 py-2 bg-[var(--paper)] border border-[var(--rule-2)]">
      <span
        className="w-6 h-6 rounded-xl flex items-center justify-center"
        style={style}
      >
        {icon}
      </span>
      <span className="flex-1 text-[12px] font-medium text-[var(--ink)]">
        {label}
      </span>
      <span
        className="text-[12px] font-bold font-serif rounded px-1.5 py-0.5"
        style={style}
      >
        {score}
      </span>
    </div>
  );
}

function ProductCard({
  selected,
  initials,
  gradient,
  name,
  score,
  state,
}: {
  selected?: boolean;
  initials: string;
  gradient?: string;
  name: string;
  score?: number;
  state: "ready" | "scanning" | "scored";
}) {
  return (
    <div
      className={`w-full max-w-[360px] flex items-start gap-4 p-4 rounded-2xl bg-[var(--paper)] border ${
        selected
          ? "border-[var(--ink)] shadow-[var(--shadow-subtle)]"
          : "border-[var(--rule-2)]"
      }`}
    >
      <div
        className="w-16 h-16 rounded-full shrink-0 relative overflow-hidden flex items-center justify-center font-serif text-[22px] text-white/70"
        style={{
          background: gradient ?? "linear-gradient(135deg,#312822,#1c1612)",
        }}
      >
        {initials}
        {state === "scored" && score != null && (
          <div
            className="absolute inset-0 flex items-center justify-center text-white text-lg font-black font-serif"
            style={{
              background:
                "color-mix(in oklch, var(--warning-text) 55%, transparent)",
            }}
          >
            {score}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <p className="font-serif font-bold text-[16px] text-[var(--ink)] capitalize leading-[1.25]">
          {name}
        </p>
        {state === "scored" && score != null && (
          <Badge
            variant={score >= 70 ? "ok" : score >= 40 ? "warn" : "err"}
            className="w-fit"
          >
            Needs work · {score}/100
          </Badge>
        )}
        {state === "scanning" && <Badge variant="scanning" className="w-fit" />}
        {state === "ready" && (
          <Badge variant="muted" className="w-fit">
            Ready to scan
          </Badge>
        )}
      </div>
    </div>
  );
}

function DollarLossCtaSample() {
  return (
    <div
      className="w-full max-w-[320px] rounded-[20px] p-[22px] relative overflow-hidden text-white shadow-[var(--shadow-brand-md)]"
      style={{
        background:
          "linear-gradient(145deg, #1a1712 0%, #2a241c 55%, #16130e 100%)",
      }}
    >
      <div
        className="absolute inset-0 opacity-[.035] pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, transparent, transparent 20px, rgba(255,255,255,.5) 20px, rgba(255,255,255,.5) 21px)",
        }}
      />
      <div className="relative flex items-center gap-2.5 mb-2.5">
        <div className="w-[34px] h-[34px] rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white/70">
          <StorefrontIcon size={16} weight="regular" />
        </div>
        <p className="font-mono text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/40 m-0">
          Shopify Plugin
        </p>
      </div>
      <h4 className="relative font-serif font-extrabold text-[18px] leading-[1.25] m-0 mb-2 text-white">
        You&rsquo;re losing{" "}
        <i className="text-[var(--accent)] italic font-bold">$2,140</i> per
        1,000 visitors
      </h4>
      <p className="relative text-[12px] leading-[1.55] text-white/55 m-0 mb-4">
        Connect your Shopify store to recover this revenue with real traffic
        data.
      </p>
      <Button
        type="button"
        variant="on-dark"
        size="sm"
        shape="card"
        className="relative z-10 w-full py-2.5"
      >
        Connect Your Store
        <ArrowRightIcon size={14} weight="bold" />
      </Button>
    </div>
  );
}

function SidebarRailSample() {
  return (
    <div className="w-16 h-[280px] bg-[var(--bg)] border border-[var(--rule-2)] rounded-2xl flex flex-col items-center py-4 gap-4">
      <div className="w-10 h-10 flex items-center justify-center">
        <svg width={36} height={36} viewBox="0 0 164 164">
          <circle
            cx="82"
            cy="78"
            r="32"
            fill="var(--ink)"
            fillOpacity=".08"
            stroke="var(--ink)"
            strokeWidth="3"
          />
          <circle cx="73" cy="74" r="3.5" fill="var(--ink)" />
          <circle cx="91" cy="74" r="3.5" fill="var(--ink)" />
          <path
            d="M74 90 Q82 91 90 90"
            fill="none"
            stroke="var(--ink)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M106 102 L114.5 110.5"
            stroke="var(--ink)"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <nav className="flex flex-col gap-2 flex-1 items-center justify-center">
        <RailItem>
          <HouseIcon size={20} weight="fill" />
        </RailItem>
        <RailItem active>
          <ChartBarIcon size={20} weight="fill" />
        </RailItem>
        <RailItem>
          <CoinIcon size={20} weight="fill" />
        </RailItem>
      </nav>
      <div className="flex flex-col items-center gap-0.5 text-[var(--ink-3)] text-[10px] font-medium">
        <UserIcon size={24} weight="fill" />
        <span>Sign in</span>
      </div>
    </div>
  );
}

function RailItem({
  active,
  children,
}: {
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
        active
          ? "bg-[var(--bg-elev)] text-[var(--ink)]"
          : "text-[var(--ink-3)] hover:bg-[var(--bg-elev)] hover:text-[var(--ink-2)]"
      }`}
    >
      {children}
    </span>
  );
}

