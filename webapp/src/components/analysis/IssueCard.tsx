"use client";

import { useState } from "react";
import {
  CaretRightIcon,
  CaretDownIcon,
  CheckCircleIcon,
  XCircleIcon,
  StarIcon,
  CameraIcon,
  VideoCameraIcon,
  FunnelIcon,
  ArrowFatUpIcon,
  CodeIcon,
  TagIcon,
  PackageIcon,
  CurrencyDollarIcon,
  TruckIcon,
  ArrowsClockwiseIcon,
  TreeStructureIcon,
  BuildingsIcon,
  WarningCircleIcon,
  LightningIcon,
  CreditCardIcon,
  ShoppingCartSimpleIcon,
  ImageIcon,
  MagnifyingGlassPlusIcon,
  TextAaIcon,
  CloudIcon,
  FileImageIcon,
  SunIcon,
  TextTIcon,
  HashIcon,
  ScissorsIcon,
  MegaphoneIcon,
  ArrowsSplitIcon,
  ListMagnifyingGlassIcon,
  ClockIcon,
  LinkSimpleIcon,
  ArticleIcon,
  ListBulletsIcon,
  BrainIcon,
  HeartIcon,
  GaugeIcon,
  TextHOneIcon,
  ShieldCheckIcon,
  PhoneIcon,
  ChatCircleIcon,
  LockSimpleIcon,
  ArrowUUpLeftIcon,
  EyeIcon,
  CursorClickIcon,
  TranslateIcon,
  WheelchairIcon,
} from "@phosphor-icons/react";
import { CATEGORY_SVG, type LeakCard, type DimensionSignals, type StructuredDataSignals, type CheckoutSignals, type PricingSignals, type ImageSignals, type TitleSignals, type ShippingSignals, type DescriptionSignals, type TrustSignals, type AccessibilitySignals } from "@/lib/analysis";

interface IssueCardProps {
  leak: LeakCard;
  index: number;
  onClick: () => void;
  variant?: "compact" | "full";
  /** When true, card expands inline with full details instead of triggering onClick */
  expandable?: boolean;
  /** Dimension signals for detailed breakdown */
  signals?: DimensionSignals;
}

/* ── Signal checklist item ── */
function SignalRow({ label, icon, present, detail }: { label: string; icon: React.ReactNode; present: boolean; detail?: string }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <div className="shrink-0 mt-0.5">
        {present
          ? <CheckCircleIcon size={16} weight="fill" color="var(--success)" />
          : <XCircleIcon size={16} weight="fill" color="var(--error)" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[var(--on-surface-variant)] opacity-60">{icon}</span>
          <span className={`text-sm font-medium ${present ? "text-[var(--on-surface)]" : "text-[var(--on-surface-variant)]"}`}>
            {label}
          </span>
        </div>
        {detail && (
          <p className="text-xs text-[var(--on-surface-variant)] mt-0.5">{detail}</p>
        )}
      </div>
    </div>
  );
}

/* ── Structured Data signal checklist ── */
function StructuredDataChecklist({ sd }: { sd: StructuredDataSignals }) {
  const requiredFields = [sd.hasName, sd.hasImage, sd.hasDescription, sd.hasOffers];
  const requiredCount = requiredFields.filter(Boolean).length;

  const offersPresent = [sd.hasPrice, sd.hasPriceCurrency, sd.hasAvailability];
  const offersCount = offersPresent.filter(Boolean).length;

  const recommendedFields = [sd.hasSku, sd.hasGtin, sd.hasAggregateRating, sd.hasPriceValidUntil];
  const recommendedCount = recommendedFields.filter(Boolean).length;

  const shippingCount = [sd.hasShippingDetails, sd.hasReturnPolicy].filter(Boolean).length;

  const errorItems: string[] = [];
  if (sd.hasCurrencyInPrice) errorItems.push("currency symbol in price value");
  if (sd.hasInvalidAvailability) errorItems.push("invalid availability value");
  if (sd.duplicateProductCount > 0) errorItems.push(`${sd.duplicateProductCount} duplicate Product schema(s)`);
  if (sd.jsonParseErrors > 0) errorItems.push(`${sd.jsonParseErrors} JSON-LD parse error(s)`);

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--on-surface-variant)] mb-2">
        What We Found
      </p>
      <div className="rounded-xl bg-[var(--surface-container-low)] p-4 space-y-0.5">
        <SignalRow
          label={sd.hasProductSchema ? "Product schema detected" : "No Product schema found"}
          icon={<CodeIcon size={14} weight="fill" />}
          present={sd.hasProductSchema}
          detail={!sd.hasProductSchema ? "Product schema is required for rich results in Google Shopping" : undefined}
        />
        <SignalRow
          label={`${requiredCount} of 4 required fields present`}
          icon={<TagIcon size={14} weight="fill" />}
          present={requiredCount === 4}
          detail={requiredCount < 4
            ? `Missing: ${[!sd.hasName && "name", !sd.hasImage && "image", !sd.hasDescription && "description", !sd.hasOffers && "offers"].filter(Boolean).join(", ")}`
            : undefined}
        />
        <SignalRow
          label={`Offers detail: ${offersCount} of 3 (price, currency, availability)`}
          icon={<CurrencyDollarIcon size={14} weight="fill" />}
          present={offersCount === 3}
          detail={offersCount < 3
            ? `Missing: ${[!sd.hasPrice && "price", !sd.hasPriceCurrency && "priceCurrency", !sd.hasAvailability && "availability"].filter(Boolean).join(", ")}`
            : undefined}
        />
        <SignalRow
          label={sd.hasBrand ? "Brand present" : "Brand missing"}
          icon={<PackageIcon size={14} weight="fill" />}
          present={sd.hasBrand && !sd.hasMissingBrand}
          detail={sd.hasMissingBrand ? "Brand field exists but value is empty or invalid" : !sd.hasBrand ? "Adding brand improves merchant listing quality" : undefined}
        />
        <SignalRow
          label={`${recommendedCount} of 4 recommended fields (SKU, GTIN, rating, priceValidUntil)`}
          icon={<TagIcon size={14} weight="regular" />}
          present={recommendedCount >= 3}
          detail={recommendedCount < 3
            ? `Missing: ${[!sd.hasSku && "SKU", !sd.hasGtin && "GTIN", !sd.hasAggregateRating && "aggregateRating", !sd.hasPriceValidUntil && "priceValidUntil"].filter(Boolean).join(", ")}`
            : undefined}
        />
        <SignalRow
          label={`Shipping & returns: ${shippingCount} of 2`}
          icon={<TruckIcon size={14} weight="fill" />}
          present={shippingCount === 2}
          detail={shippingCount < 2
            ? `Missing: ${[!sd.hasShippingDetails && "shippingDetails", !sd.hasReturnPolicy && "returnPolicy"].filter(Boolean).join(", ")}`
            : undefined}
        />
        <SignalRow
          label="BreadcrumbList schema"
          icon={<TreeStructureIcon size={14} weight="fill" />}
          present={sd.hasBreadcrumbList}
          detail={!sd.hasBreadcrumbList ? "Breadcrumbs improve search appearance and click-through rate" : undefined}
        />
        <SignalRow
          label="Organization schema"
          icon={<BuildingsIcon size={14} weight="fill" />}
          present={sd.hasOrganization}
          detail={!sd.hasOrganization ? "Organization schema helps Google display business info in search" : undefined}
        />
        {errorItems.length > 0 && (
          <SignalRow
            label={`${errorItems.length} error${errorItems.length > 1 ? "s" : ""} found`}
            icon={<WarningCircleIcon size={14} weight="fill" />}
            present={false}
            detail={errorItems.join("; ")}
          />
        )}
      </div>
    </div>
  );
}

/* ── Checkout signal checklist ── */
function CheckoutChecklist({ co }: { co: CheckoutSignals }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--on-surface-variant)] mb-2">
        What We Found
      </p>
      <div className="rounded-xl bg-[var(--surface-container-low)] p-4 space-y-0.5">
        {/* Express Checkout */}
        <SignalRow
          label="Shop Pay / accelerated checkout"
          icon={<LightningIcon size={14} weight="fill" />}
          present={co.hasAcceleratedCheckout}
          detail={!co.hasAcceleratedCheckout ? "Accelerated checkout can boost conversion 1.7×" : undefined}
        />
        <SignalRow
          label="Dynamic checkout button"
          icon={<LightningIcon size={14} weight="fill" />}
          present={co.hasDynamicCheckoutButton}
          detail={!co.hasDynamicCheckoutButton ? "Shows the buyer's preferred payment at checkout" : undefined}
        />
        <SignalRow
          label="PayPal"
          icon={<CurrencyDollarIcon size={14} weight="fill" />}
          present={co.hasPaypal}
          detail={!co.hasPaypal ? "PayPal reaches 400M+ active buyers globally" : undefined}
        />

        {/* BNPL Providers */}
        <SignalRow
          label="Klarna"
          icon={<CreditCardIcon size={14} weight="fill" />}
          present={co.hasKlarna}
          detail={!co.hasKlarna ? "BNPL options increase AOV by up to 45%" : undefined}
        />
        <SignalRow
          label="Afterpay"
          icon={<CreditCardIcon size={14} weight="fill" />}
          present={co.hasAfterpay}
          detail={!co.hasAfterpay ? "Afterpay drives repeat purchases at 2× the rate" : undefined}
        />
        <SignalRow
          label="Affirm"
          icon={<CreditCardIcon size={14} weight="fill" />}
          present={co.hasAffirm}
          detail={!co.hasAffirm ? "Affirm reduces cart abandonment on high-AOV items" : undefined}
        />
        <SignalRow
          label="Sezzle"
          icon={<CreditCardIcon size={14} weight="fill" />}
          present={co.hasSezzle}
          detail={!co.hasSezzle ? "Sezzle targets younger demographics effectively" : undefined}
        />

        {/* Payment Diversity */}
        <SignalRow
          label={`${co.paymentMethodCount} of 5 payment methods detected`}
          icon={<CreditCardIcon size={14} weight="fill" />}
          present={co.paymentMethodCount >= 3}
          detail={co.paymentMethodCount < 3 ? "Offer 3+ payment methods to reduce checkout friction" : undefined}
        />

        {/* Cart Experience */}
        <SignalRow
          label="Drawer / slide-out cart"
          icon={<ShoppingCartSimpleIcon size={14} weight="fill" />}
          present={co.hasDrawerCart}
          detail={!co.hasDrawerCart ? "Drawer carts keep shoppers on the page" : undefined}
        />
        <SignalRow
          label="AJAX add-to-cart"
          icon={<ShoppingCartSimpleIcon size={14} weight="fill" />}
          present={co.hasAjaxCart}
          detail={!co.hasAjaxCart ? "AJAX cart avoids disruptive page reloads" : undefined}
        />
        <SignalRow
          label="Sticky checkout button"
          icon={<ShoppingCartSimpleIcon size={14} weight="fill" />}
          present={co.hasStickyCheckout}
          detail={!co.hasStickyCheckout ? "Sticky buttons keep CTA visible while scrolling" : undefined}
        />
      </div>
    </div>
  );
}

/* ── Pricing Psychology signal checklist ── */
function PricingChecklist({ pr }: { pr: PricingSignals }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--on-surface-variant)] mb-2">
        What We Found
      </p>
      <div className="rounded-xl bg-[var(--surface-container-low)] p-4 space-y-0.5">
        {/* Compare-at / anchoring */}
        <SignalRow
          label={pr.hasCompareAtPrice ? "Compare-at price detected" : "No compare-at price"}
          icon={<TagIcon size={14} weight="fill" />}
          present={pr.hasCompareAtPrice}
          detail={!pr.hasCompareAtPrice ? "Strikethrough anchoring produces a 25–40% conversion lift" : undefined}
        />
        <SignalRow
          label={pr.hasStrikethroughPrice ? "Strikethrough price present" : "No strikethrough price"}
          icon={<TagIcon size={14} weight="fill" />}
          present={pr.hasStrikethroughPrice}
          detail={!pr.hasStrikethroughPrice ? "Visible original price with strike-through reinforces value" : undefined}
        />

        {/* Charm pricing */}
        <SignalRow
          label={
            pr.priceValue != null
              ? pr.hasCharmPricing
                ? `Charm pricing detected ($${pr.priceValue})`
                : pr.isRoundPrice
                  ? `Round price ($${pr.priceValue}) — consider .99 ending`
                  : `Price: $${pr.priceValue}`
              : "No price extracted"
          }
          icon={<CurrencyDollarIcon size={14} weight="fill" />}
          present={pr.hasCharmPricing}
          detail={!pr.hasCharmPricing && pr.isRoundPrice ? "MIT field experiments show 24% sales increase from .99 endings" : undefined}
        />

        {/* BNPL installment messaging */}
        <SignalRow
          label={pr.hasBnplNearPrice ? "BNPL installment messaging present" : "No BNPL installment messaging"}
          icon={<CreditCardIcon size={14} weight="fill" />}
          present={pr.hasBnplNearPrice}
          detail={!pr.hasBnplNearPrice ? "'Pay in 4' framing increases conversion 20–35% on items over $50" : undefined}
        />
        <SignalRow
          label="Klarna"
          icon={<CreditCardIcon size={14} weight="fill" />}
          present={pr.hasKlarnaPlacement}
        />
        <SignalRow
          label="Afterpay"
          icon={<CreditCardIcon size={14} weight="fill" />}
          present={pr.hasAfterPayBadge}
        />
        <SignalRow
          label="Shop Pay Installments"
          icon={<CreditCardIcon size={14} weight="fill" />}
          present={pr.hasShopPayInstallments}
        />

        {/* Urgency / scarcity */}
        <SignalRow
          label={pr.hasCountdownTimer ? "Countdown timer present" : "No countdown timer"}
          icon={<LightningIcon size={14} weight="fill" />}
          present={pr.hasCountdownTimer && !pr.hasFakeTimerRisk}
          detail={
            pr.hasFakeTimerRisk
              ? "Timer may be fake — Princeton research found ~40% of e-commerce timers are artificial"
              : !pr.hasCountdownTimer
                ? "Truthful countdown timers increase conversion up to 17.8%"
                : undefined
          }
        />
        <SignalRow
          label={pr.hasScarcityMessaging ? "Stock scarcity messaging present" : "No scarcity messaging"}
          icon={<LightningIcon size={14} weight="fill" />}
          present={pr.hasScarcityMessaging}
          detail={!pr.hasScarcityMessaging ? "Real-time stock levels ('Only 3 left') drive urgency and increase conversions" : undefined}
        />
      </div>
    </div>
  );
}

/* ── Product Images signal checklist ── */
function ImagesChecklist({ im }: { im: ImageSignals }) {
  const altPct = Math.round(im.altTextScore * 100);
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--on-surface-variant)] mb-2">
        What We Found
      </p>
      <div className="rounded-xl bg-[var(--surface-container-low)] p-4 space-y-0.5">
        <SignalRow
          label={`${im.imageCount} product image${im.imageCount !== 1 ? "s" : ""} detected`}
          icon={<ImageIcon size={14} weight="fill" />}
          present={im.imageCount >= 5}
          detail={im.imageCount < 3
            ? "56% of shoppers explore images first — aim for 5–8 images"
            : im.imageCount < 5
              ? "Good start, but 5–8 images is optimal for conversion"
              : undefined}
        />
        <SignalRow
          label={im.hasVideo ? "Product video present" : "No product video"}
          icon={<VideoCameraIcon size={14} weight="fill" />}
          present={im.hasVideo}
          detail={!im.hasVideo ? "Product video increases add-to-cart by 37%" : undefined}
        />
        <SignalRow
          label={im.has360View ? "360° view available" : "No 360° view"}
          icon={<ArrowsClockwiseIcon size={14} weight="fill" />}
          present={im.has360View}
          detail={!im.has360View ? "360° views increase conversion by 27%" : undefined}
        />
        <SignalRow
          label={im.hasZoom ? "Zoom/magnify enabled" : "No zoom capability"}
          icon={<MagnifyingGlassPlusIcon size={14} weight="fill" />}
          present={im.hasZoom}
          detail={!im.hasZoom ? "42% of shoppers gauge size from images (Baymard)" : undefined}
        />
        <SignalRow
          label={`Alt text quality: ${altPct}%`}
          icon={<TextAaIcon size={14} weight="fill" />}
          present={im.altTextScore >= 0.7}
          detail={im.altTextScore < 0.5
            ? "Descriptive alt text increases organic traffic by 30%"
            : im.altTextScore < 0.7
              ? "Alt text is decent but could be more descriptive and unique"
              : undefined}
        />
        <SignalRow
          label={im.hasModernFormat ? "WebP/AVIF format detected" : "No modern image formats"}
          icon={<FileImageIcon size={14} weight="fill" />}
          present={im.hasModernFormat}
          detail={!im.hasModernFormat ? "WebP/AVIF saves 25–50% file size vs JPEG" : undefined}
        />
        <SignalRow
          label={im.hasHighRes ? "High-resolution images" : "No high-res images detected"}
          icon={<ImageIcon size={14} weight="fill" />}
          present={im.hasHighRes}
          detail={!im.hasHighRes ? "Serve images at 1000px+ width for quality zoom experience" : undefined}
        />
        <SignalRow
          label={im.hasLifestyleImages ? "Lifestyle/context images detected" : "No lifestyle images detected"}
          icon={<SunIcon size={14} weight="fill" />}
          present={im.hasLifestyleImages}
          detail={!im.hasLifestyleImages ? "Contextual imagery drives 38% higher conversion" : undefined}
        />
        <SignalRow
          label={im.cdnHosted ? "CDN-hosted images" : "Images not on CDN"}
          icon={<CloudIcon size={14} weight="fill" />}
          present={im.cdnHosted}
          detail={!im.cdnHosted ? "CDN delivery improves page load and global performance" : undefined}
        />
      </div>
    </div>
  );
}

/* ── Title & SEO signal checklist ── */
function TitleChecklist({ ti }: { ti: TitleSignals }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--on-surface-variant)] mb-2">
        What We Found
      </p>
      <div className="rounded-xl bg-[var(--surface-container-low)] p-4 space-y-0.5">
        <SignalRow
          label={ti.hasH1 ? `H1: "${ti.h1Text && ti.h1Text.length > 50 ? ti.h1Text.slice(0, 50) + "…" : ti.h1Text}"` : "No H1 tag found"}
          icon={<TextTIcon size={14} weight="fill" />}
          present={ti.hasH1}
          detail={!ti.hasH1 ? "Products with proper heading hierarchy see 12–15% better CTR" : undefined}
        />
        <SignalRow
          label={`${ti.h1Count} H1 tag${ti.h1Count !== 1 ? "s" : ""} on page`}
          icon={<HashIcon size={14} weight="fill" />}
          present={ti.hasSingleH1}
          detail={ti.h1Count > 1 ? "Multiple H1s confuse search engine crawlers" : ti.h1Count === 0 ? "Every page needs exactly one H1" : undefined}
        />
        <SignalRow
          label={ti.hasH1 ? `H1 length: ${ti.h1Length} chars` : "H1 length: N/A"}
          icon={<ScissorsIcon size={14} weight="fill" />}
          present={ti.hasH1 && ti.h1Length <= 80}
          detail={ti.h1Length > 80 ? `${ti.h1Length - 80} characters over the 80-char limit` : undefined}
        />
        <SignalRow
          label={ti.metaTitle ? `Meta title: ${ti.metaTitleLength} chars` : "No meta title found"}
          icon={<ScissorsIcon size={14} weight="fill" />}
          present={ti.metaTitle != null && ti.metaTitleLength <= 60}
          detail={ti.metaTitleLength > 60 ? `${ti.metaTitleLength - 60} chars over SERP limit — title will be truncated` : undefined}
        />
        <SignalRow
          label={ti.hasBrandInTitle ? `Brand "${ti.brandName}" in title` : ti.brandName ? `Brand "${ti.brandName}" missing from title` : "Brand not detected"}
          icon={<TagIcon size={14} weight="fill" />}
          present={ti.hasBrandInTitle}
          detail={!ti.hasBrandInTitle && ti.brandName ? "97% of top-performing titles include the brand" : undefined}
        />
        <SignalRow
          label={ti.hasKeywordStuffing ? "Keyword stuffing detected" : "No keyword stuffing"}
          icon={<WarningCircleIcon size={14} weight="fill" />}
          present={!ti.hasKeywordStuffing}
          detail={ti.hasKeywordStuffing ? "Repeated keywords reduce trust and risk Google penalties" : undefined}
        />
        <SignalRow
          label={ti.isAllCaps ? "Title is ALL CAPS" : "Proper case used"}
          icon={<TextAaIcon size={14} weight="fill" />}
          present={!ti.isAllCaps}
          detail={ti.isAllCaps ? "Mixed case is 40% more readable and trustworthy" : undefined}
        />
        <SignalRow
          label={ti.hasPromotionalText ? "Promotional text in title" : "No promotional text"}
          icon={<MegaphoneIcon size={14} weight="fill" />}
          present={!ti.hasPromotionalText}
          detail={ti.hasPromotionalText ? "SEO titles should describe the product, not the deal" : undefined}
        />
        <SignalRow
          label={ti.h1MetaDiffer ? "H1 and meta title are different" : "H1 and meta title are identical"}
          icon={<ArrowsSplitIcon size={14} weight="fill" />}
          present={ti.h1MetaDiffer}
          detail={!ti.h1MetaDiffer && ti.hasH1 && ti.metaTitle ? "Optimize meta title for SERP display separately from the on-page H1" : undefined}
        />
        <SignalRow
          label={ti.hasSpecifics ? "Product specifics detected (color, size, material)" : "Title lacks product specifics"}
          icon={<ListMagnifyingGlassIcon size={14} weight="fill" />}
          present={ti.hasSpecifics}
          detail={!ti.hasSpecifics ? "Adding color, size, or material improves search specificity" : undefined}
        />
      </div>
    </div>
  );
}

/* ── Description Quality signal checklist ── */
function DescriptionChecklist({ de }: { de: DescriptionSignals }) {
  const benefitPct = Math.round(de.benefitRatio * 100);
  const emotionalPct = (de.emotionalDensity * 100).toFixed(1);
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--on-surface-variant)] mb-2">
        What We Found
      </p>
      <div className="rounded-xl bg-[var(--surface-container-low)] p-4 space-y-0.5">
        <SignalRow
          label={de.descriptionFound ? "Product description detected" : "No product description found"}
          icon={<ArticleIcon size={14} weight="fill" />}
          present={de.descriptionFound}
          detail={!de.descriptionFound ? "87% of shoppers consider descriptions the most important purchase factor" : undefined}
        />
        <SignalRow
          label={`${de.wordCount} words`}
          icon={<ArticleIcon size={14} weight="fill" />}
          present={de.wordCount >= 100 && de.wordCount <= 400}
          detail={
            de.wordCount < 50
              ? "Too thin \u2014 aim for 100\u2013400 words"
              : de.wordCount < 100
                ? "A bit short \u2014 100\u2013400 words is optimal"
                : de.wordCount > 600
                  ? "Over 600 words risks losing readers before the buy button"
                  : de.wordCount > 400
                    ? "Slightly long \u2014 100\u2013400 words is the sweet spot"
                    : undefined
          }
        />
        <SignalRow
          label={`Reading level: grade ${de.fleschKincaidGrade.toFixed(1)}`}
          icon={<GaugeIcon size={14} weight="fill" />}
          present={de.fleschKincaidGrade >= 4 && de.fleschKincaidGrade <= 10}
          detail={
            de.fleschKincaidGrade > 10
              ? "Too complex \u2014 grade 6\u20138 maximises comprehension"
              : de.fleschKincaidGrade < 4 && de.descriptionFound
                ? "Very simple \u2014 grade 6\u20138 is the target"
                : undefined
          }
        />
        <SignalRow
          label={`Avg sentence: ${de.avgSentenceLength.toFixed(0)} words`}
          icon={<ScissorsIcon size={14} weight="fill" />}
          present={de.avgSentenceLength >= 10 && de.avgSentenceLength <= 20}
          detail={
            de.avgSentenceLength > 25
              ? "Sentences are too long \u2014 target 10\u201320 words per sentence"
              : de.avgSentenceLength < 8 && de.descriptionFound
                ? "Sentences are very short \u2014 10\u201320 words is ideal"
                : undefined
          }
        />
        <SignalRow
          label={`Benefit vs feature ratio: ${benefitPct}% benefit-focused`}
          icon={<HeartIcon size={14} weight="fill" />}
          present={de.benefitRatio >= 0.3 && de.benefitRatio <= 0.7}
          detail={
            de.benefitRatio < 0.3 && (de.benefitWordCount + de.featureWordCount) > 3
              ? "Feature-heavy \u2014 lead with benefits over features for 12\u201324% higher conversion"
              : de.benefitRatio > 0.7 && (de.benefitWordCount + de.featureWordCount) > 3
                ? "Add more feature details \u2014 shoppers need specs to confirm their decision"
                : undefined
          }
        />
        <SignalRow
          label={`Emotional language: ${emotionalPct}%`}
          icon={<BrainIcon size={14} weight="fill" />}
          present={de.emotionalDensity >= 0.02 && de.emotionalDensity <= 0.10}
          detail={
            de.emotionalDensity < 0.01 && de.descriptionFound
              ? "Copy feels flat \u2014 3\u20138% emotional words drives higher engagement"
              : undefined
          }
        />
        <SignalRow
          label={`${de.htmlTagVariety} formatting tag types`}
          icon={<CodeIcon size={14} weight="fill" />}
          present={de.htmlTagVariety >= 4}
          detail={
            de.htmlTagVariety === 0 && de.descriptionFound
              ? "Plain text wall \u2014 add bold, bullets, and images"
              : de.htmlTagVariety < 4 && de.descriptionFound
                ? "Basic formatting \u2014 add more variety for better scannability"
                : undefined
          }
        />
        <SignalRow
          label={de.hasHeadings && de.hasBulletLists ? "Structured layout (headings + bullets)" : de.hasHeadings ? "Has headings but no bullet lists" : de.hasBulletLists ? "Has bullets but no section headings" : "No structural elements"}
          icon={<TextHOneIcon size={14} weight="fill" />}
          present={de.hasHeadings && de.hasBulletLists}
          detail={
            !de.hasHeadings && de.descriptionFound
              ? "Add H2/H3 headings to break content into scannable sections"
              : !de.hasBulletLists && de.descriptionFound
                ? "Add bullet points \u2014 only 16% of users read word-for-word"
                : undefined
          }
        />
      </div>
    </div>
  );
}

/* ── Shipping Transparency signal checklist ── */
function ShippingChecklist({ sh }: { sh: ShippingSignals }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--on-surface-variant)] mb-2">
        What We Found
      </p>
      <div className="rounded-xl bg-[var(--surface-container-low)] p-4 space-y-0.5">
        <SignalRow
          label={sh.hasFreeShipping ? "Free shipping detected" : "No free shipping messaging"}
          icon={<TruckIcon size={14} weight="fill" />}
          present={sh.hasFreeShipping}
          detail={!sh.hasFreeShipping ? "62% of shoppers won't purchase without free shipping" : undefined}
        />
        <SignalRow
          label={
            sh.hasFreeShippingThreshold
              ? `Free shipping threshold: $${sh.freeShippingThresholdValue ?? "?"}`
              : "No free shipping threshold"
          }
          icon={<TagIcon size={14} weight="fill" />}
          present={sh.hasFreeShippingThreshold}
          detail={!sh.hasFreeShippingThreshold && sh.hasFreeShipping
            ? "Set threshold 10–15% above AOV — 58% of shoppers add items to qualify"
            : undefined}
        />
        <SignalRow
          label={sh.hasDeliveryDate ? "Specific delivery date found" : "No specific delivery date"}
          icon={<TruckIcon size={14} weight="fill" />}
          present={sh.hasDeliveryDate}
          detail={!sh.hasDeliveryDate
            ? "'Arrives by Thursday, Feb 12' outperforms '3–5 business days' by 24%"
            : undefined}
        />
        <SignalRow
          label={sh.hasDeliveryEstimate ? "Business-day estimate present" : "No delivery time estimate"}
          icon={<ClockIcon size={14} weight="fill" />}
          present={sh.hasDeliveryEstimate || sh.hasDeliveryDate}
          detail={!sh.hasDeliveryEstimate && !sh.hasDeliveryDate
            ? "75% of shoppers say delivery dates influence purchase decisions"
            : sh.hasDeliveryEstimate && !sh.hasDeliveryDate
              ? "Upgrade to a specific date for better conversion"
              : undefined}
        />
        <SignalRow
          label={sh.hasEddApp ? "Delivery date app detected" : "No EDD app installed"}
          icon={<LightningIcon size={14} weight="fill" />}
          present={sh.hasEddApp}
          detail={!sh.hasEddApp ? "Apps like AfterShip EDD or Synctrack automate delivery estimates" : undefined}
        />
        <SignalRow
          label={sh.hasShippingCostShown ? "Shipping cost visible" : "No shipping cost shown"}
          icon={<CurrencyDollarIcon size={14} weight="fill" />}
          present={sh.hasShippingCostShown}
          detail={!sh.hasShippingCostShown ? "Hidden extra costs cause 48% of all cart abandonment" : undefined}
        />
        <SignalRow
          label={sh.hasShippingInStructuredData ? "shippingDetails in schema" : "No shippingDetails in schema"}
          icon={<CodeIcon size={14} weight="fill" />}
          present={sh.hasShippingInStructuredData}
          detail={!sh.hasShippingInStructuredData ? "Enables shipping info in Google Shopping and AI citations" : undefined}
        />
        <SignalRow
          label={sh.hasShippingPolicyLink ? "Shipping policy link found" : "No shipping policy link"}
          icon={<LinkSimpleIcon size={14} weight="fill" />}
          present={sh.hasShippingPolicyLink}
          detail={!sh.hasShippingPolicyLink ? "A visible policy link reduces pre-purchase hesitation" : undefined}
        />
        <SignalRow
          label={sh.hasReturnsMentioned ? "Returns/refund info present" : "No returns info mentioned"}
          icon={<ArrowsClockwiseIcon size={14} weight="fill" />}
          present={sh.hasReturnsMentioned}
          detail={!sh.hasReturnsMentioned ? "Combined shipping + returns transparency builds buyer confidence" : undefined}
        />
      </div>
    </div>
  );
}

/* ── Trust & Guarantees signal checklist ── */
function TrustChecklist({ tr }: { tr: TrustSignals }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--on-surface-variant)] mb-2">
        What We Found
      </p>
      <div className="rounded-xl bg-[var(--surface-container-low)] p-4 space-y-0.5">
        <SignalRow
          label={tr.hasMoneyBackGuarantee ? "Money-back guarantee detected" : "No money-back guarantee"}
          icon={<ShieldCheckIcon size={14} weight="fill" />}
          present={tr.hasMoneyBackGuarantee}
          detail={!tr.hasMoneyBackGuarantee ? "Money-back guarantees increase conversion up to 32%" : undefined}
        />
        <SignalRow
          label={tr.hasReturnPolicy ? "Return policy visible" : "No return policy visible"}
          icon={<ArrowUUpLeftIcon size={14} weight="fill" />}
          present={tr.hasReturnPolicy}
          detail={!tr.hasReturnPolicy ? "Visible return policy lifts conversion 8–14% for products over $75" : undefined}
        />
        <SignalRow
          label={tr.hasSecurityBadge ? "Security badge detected" : "No security badge"}
          icon={<LockSimpleIcon size={14} weight="fill" />}
          present={tr.hasSecurityBadge}
          detail={!tr.hasSecurityBadge ? "Norton/McAfee badges increase conversion 12.2%" : undefined}
        />
        <SignalRow
          label={tr.hasSafeCheckoutBadge ? '"Guaranteed Safe Checkout" badge' : "No safe checkout badge"}
          icon={<ShieldCheckIcon size={14} weight="fill" />}
          present={tr.hasSafeCheckoutBadge}
          detail={!tr.hasSafeCheckoutBadge ? "Payment security icons lift conversion 11%" : undefined}
        />
        <SignalRow
          label={`${tr.trustBadgeCount} trust badge${tr.trustBadgeCount !== 1 ? "s" : ""} found`}
          icon={<ShieldCheckIcon size={14} weight="fill" />}
          present={tr.trustBadgeCount >= 2}
          detail={tr.trustBadgeCount === 0 ? "Aim for 2–3 trust badges at 60–80px wide" : tr.trustBadgeCount > 3 ? "More than 3 badges creates visual clutter" : undefined}
        />
        <SignalRow
          label={tr.hasSecureCheckoutText ? "Secure checkout messaging" : "No secure checkout text"}
          icon={<LockSimpleIcon size={14} weight="fill" />}
          present={tr.hasSecureCheckoutText}
        />
        <SignalRow
          label={tr.hasPaymentIcons ? "Payment trust icons visible" : "No payment trust icons"}
          icon={<CreditCardIcon size={14} weight="fill" />}
          present={tr.hasPaymentIcons}
          detail={!tr.hasPaymentIcons ? "Familiar payment logos reduce checkout anxiety" : undefined}
        />
        <SignalRow
          label={tr.hasLiveChat ? "Live chat available" : "No live chat detected"}
          icon={<ChatCircleIcon size={14} weight="fill" />}
          present={tr.hasLiveChat}
          detail={!tr.hasLiveChat ? "Live chat increases conversion 20% on average" : undefined}
        />
        <SignalRow
          label={tr.hasPhoneNumber ? "Phone number visible" : "No phone number"}
          icon={<PhoneIcon size={14} weight="fill" />}
          present={tr.hasPhoneNumber}
          detail={!tr.hasPhoneNumber ? "Phone visibility is the #1 global trust symbol" : undefined}
        />
        <SignalRow
          label={tr.hasFreeShippingBadge ? "Free shipping messaging" : "No free shipping badge"}
          icon={<TruckIcon size={14} weight="fill" />}
          present={tr.hasFreeShippingBadge}
        />
        <SignalRow
          label={tr.hasTrustNearAtc ? "Trust signals near Add to Cart" : "No trust signals near ATC"}
          icon={<ShieldCheckIcon size={14} weight="fill" />}
          present={tr.hasTrustNearAtc}
          detail={!tr.hasTrustNearAtc ? "Trust badges near ATC deliver 8–19% conversion lift" : undefined}
        />
      </div>
    </div>
  );
}

/* ── Accessibility signal checklist ── */
function AccessibilityChecklist({ ac }: { ac: AccessibilitySignals }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--on-surface-variant)] mb-2">
        What We Found
      </p>
      <div className="rounded-xl bg-[var(--surface-container-low)] p-4 space-y-0.5">
        <SignalRow label={ac.contrastViolations === 0 ? "Color contrast passes" : `${ac.contrastViolations} contrast violation(s)`} icon={<EyeIcon size={14} weight="fill" />} present={ac.contrastViolations === 0} />
        <SignalRow label={ac.altTextViolations === 0 ? "All images have alt text" : `${ac.altTextViolations} missing alt text`} icon={<ImageIcon size={14} weight="fill" />} present={ac.altTextViolations === 0} />
        <SignalRow label={ac.formLabelViolations === 0 ? "All form inputs labeled" : `${ac.formLabelViolations} unlabeled input(s)`} icon={<TagIcon size={14} weight="fill" />} present={ac.formLabelViolations === 0} />
        <SignalRow label={ac.emptyLinkViolations === 0 ? "All links have names" : `${ac.emptyLinkViolations} empty link(s)`} icon={<LinkSimpleIcon size={14} weight="fill" />} present={ac.emptyLinkViolations === 0} />
        <SignalRow label={ac.emptyButtonViolations === 0 ? "All buttons have names" : `${ac.emptyButtonViolations} empty button(s)`} icon={<CursorClickIcon size={14} weight="fill" />} present={ac.emptyButtonViolations === 0} />
        <SignalRow label={ac.documentLanguageViolations === 0 ? "Document language set" : "Missing document language"} icon={<TranslateIcon size={14} weight="fill" />} present={ac.documentLanguageViolations === 0} />
      </div>
    </div>
  );
}

export default function IssueCard({
  leak,
  index,
  onClick,
  variant = "compact",
  expandable = false,
  signals,
}: IssueCardProps) {
  const full = variant === "full";
  const [expanded, setExpanded] = useState(false);

  const impactStyle = {
    HIGH: { textColor: "var(--error-text)" },
    MED: { textColor: "var(--warning-text)" },
    LOW: { textColor: "var(--success-text)" },
  }[leak.impact as "HIGH" | "MED" | "LOW"] || { textColor: "var(--on-surface)" };

  const handleClick = () => {
    if (expandable) {
      setExpanded((prev) => !prev);
    } else {
      onClick();
    }
  };

  return (
    <div
      className={`group text-left bg-[var(--surface)] rounded-[1.5rem] ${full ? "p-6 sm:p-7" : "p-5 sm:p-6"} flex flex-col border border-[var(--outline-variant)]/20 ${expanded ? "border-[var(--brand)]/40" : "hover:border-[var(--brand)]/40"} transition-all duration-300 ${expanded ? "" : "hover:-translate-y-1"} hover:shadow-[var(--shadow-card-hover)]`}
      style={{
        boxShadow: "var(--shadow-subtle)",
        animation: `fade-in-up 400ms ease-out ${index * 70}ms both`,
      }}
    >
      {/* ── Clickable header ── */}
      <button
        type="button"
        onClick={handleClick}
        className="cursor-pointer text-left w-full"
      >
        <div className={full ? "space-y-5" : "space-y-4"}>
          {/* Icon + Score */}
          <div className="flex justify-between items-start">
            <div className={`${full ? "w-12 h-12" : "w-11 h-11"} bg-[var(--surface-container-high)] rounded-2xl flex items-center justify-center text-[var(--on-surface-variant)] group-hover:text-[var(--brand)] group-hover:scale-110 transition-all duration-300`}>
              {CATEGORY_SVG[leak.key] || CATEGORY_SVG.title}
            </div>
            <div className="text-right">
              <div className="text-[9px] font-bold text-[var(--on-surface-variant)] tracking-[0.15em] uppercase">Score</div>
              <div
                className="text-xl font-extrabold"
                style={{ color: impactStyle.textColor, fontVariantNumeric: "tabular-nums" }}
              >
                {leak.catScore}<span className="text-xs font-semibold opacity-50">/100</span>
              </div>
            </div>
          </div>

          {/* Category + Problem */}
          <div className="space-y-2">
            <h3 className={`${full ? "text-lg sm:text-xl" : "text-base sm:text-lg"} font-bold text-[var(--on-surface)] tracking-tight leading-snug`}>
              {leak.category}
            </h3>
            <p className="text-sm text-[var(--on-surface-variant)] leading-relaxed line-clamp-3">
              {leak.problem}
            </p>
          </div>
        </div>

        {/* Bottom: Revenue + Arrow/Chevron */}
        <div className={`${full ? "mt-6 pt-5" : "mt-5 pt-4"} border-t border-[var(--surface-container)] flex justify-between items-center`}>
          <div>
            <div className="text-[9px] font-bold text-[var(--on-surface-variant)] uppercase tracking-[0.15em]">Potential Gain</div>
            <div className={`${full ? "text-base sm:text-lg" : "text-base"} font-extrabold text-[var(--success)]`}>
              {leak.revenue}
            </div>
          </div>
          {expandable ? (
            <CaretDownIcon
              className={`w-5 h-5 text-[var(--on-surface-variant)] group-hover:text-[var(--brand)] transition-all duration-200 ${expanded ? "rotate-180" : ""}`}
              weight="bold"
            />
          ) : (
            <CaretRightIcon
              className="w-5 h-5 text-[var(--on-surface-variant)] group-hover:text-[var(--brand)] group-hover:translate-x-1 transition-all duration-200"
              weight="bold"
            />
          )}
        </div>
      </button>

      {/* ── Expandable details panel ── */}
      {expandable && (
        <div
          className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.165,0.84,0.44,1)]"
          style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="pt-5 mt-5 border-t border-[var(--surface-container)] space-y-5">
              {/* Fix recommendation */}
              {leak.tip && (
                <div className="rounded-xl bg-[var(--success-light)] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--success-text)] mb-1.5">
                    Recommended Fix
                  </p>
                  <p className="text-sm text-[var(--on-surface)] leading-relaxed">
                    {leak.tip}
                  </p>
                </div>
              )}

              {/* Signal breakdown — Social Proof */}
              {signals?.socialProof && leak.key === "socialProof" && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--on-surface-variant)] mb-2">
                    What We Found
                  </p>
                  <div className="rounded-xl bg-[var(--surface-container-low)] p-4 space-y-0.5">
                    <SignalRow
                      label={signals.socialProof.reviewApp ? `Review app: ${signals.socialProof.reviewApp}` : "No review app detected"}
                      icon={<StarIcon size={14} weight="fill" />}
                      present={signals.socialProof.reviewApp !== null}
                    />
                    <SignalRow
                      label={signals.socialProof.starRating !== null ? `Star rating: ${signals.socialProof.starRating}/5` : "No star rating found"}
                      icon={<StarIcon size={14} weight="fill" />}
                      present={signals.socialProof.starRating !== null}
                      detail={signals.socialProof.starRating !== null && (signals.socialProof.starRating < 4.2 || signals.socialProof.starRating > 4.7)
                        ? `Optimal range is 4.2–4.7 stars`
                        : undefined}
                    />
                    <SignalRow
                      label={signals.socialProof.reviewCount !== null ? `${signals.socialProof.reviewCount} reviews` : "No review count found"}
                      icon={<StarIcon size={14} weight="regular" />}
                      present={signals.socialProof.reviewCount !== null && signals.socialProof.reviewCount >= 5}
                      detail={signals.socialProof.reviewCount !== null && signals.socialProof.reviewCount < 5
                        ? "Products with 5+ reviews see 270% higher conversion"
                        : signals.socialProof.reviewCount !== null && signals.socialProof.reviewCount < 30
                          ? "Aim for 30+ reviews for maximum impact"
                          : undefined}
                    />
                    <SignalRow
                      label="Photo reviews"
                      icon={<CameraIcon size={14} weight="fill" />}
                      present={signals.socialProof.hasPhotoReviews}
                      detail={!signals.socialProof.hasPhotoReviews ? "Photo reviews boost conversion by 106%" : undefined}
                    />
                    <SignalRow
                      label="Video reviews"
                      icon={<VideoCameraIcon size={14} weight="fill" />}
                      present={signals.socialProof.hasVideoReviews}
                    />
                    <SignalRow
                      label="Star rating above fold"
                      icon={<ArrowFatUpIcon size={14} weight="fill" />}
                      present={signals.socialProof.starRatingAboveFold}
                      detail={!signals.socialProof.starRatingAboveFold ? "56% of shoppers check reviews before anything else" : undefined}
                    />
                    <SignalRow
                      label="Review filtering & sorting"
                      icon={<FunnelIcon size={14} weight="fill" />}
                      present={signals.socialProof.hasReviewFiltering}
                      detail={!signals.socialProof.hasReviewFiltering ? "Shoppers who filter reviews are 2x more likely to convert" : undefined}
                    />
                  </div>
                </div>
              )}

              {/* Signal breakdown — Structured Data */}
              {signals?.structuredData && leak.key === "structuredData" && (
                <StructuredDataChecklist sd={signals.structuredData} />
              )}

              {/* Signal breakdown — Checkout */}
              {signals?.checkout && leak.key === "checkout" && (
                <CheckoutChecklist co={signals.checkout} />
              )}

              {/* Signal breakdown — Pricing */}
              {signals?.pricing && leak.key === "pricing" && (
                <PricingChecklist pr={signals.pricing} />
              )}

              {/* Signal breakdown — Images */}
              {signals?.images && leak.key === "images" && (
                <ImagesChecklist im={signals.images} />
              )}

              {/* Signal breakdown — Title & SEO */}
              {signals?.title && leak.key === "title" && (
                <TitleChecklist ti={signals.title} />
              )}

              {/* Signal breakdown — Description Quality */}
              {signals?.description && leak.key === "description" && (
                <DescriptionChecklist de={signals.description} />
              )}

              {/* Signal breakdown — Shipping Transparency */}
              {signals?.shipping && leak.key === "shipping" && (
                <ShippingChecklist sh={signals.shipping} />
              )}

              {/* Signal breakdown — Trust & Guarantees */}
              {signals?.trust && leak.key === "trust" && (
                <TrustChecklist tr={signals.trust} />
              )}

              {/* Signal breakdown — Accessibility */}
              {signals?.accessibility && leak.key === "accessibility" && (
                <AccessibilityChecklist ac={signals.accessibility} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
