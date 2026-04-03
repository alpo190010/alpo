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
} from "@phosphor-icons/react";
import { CATEGORY_SVG, type LeakCard, type DimensionSignals, type StructuredDataSignals } from "@/lib/analysis";

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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
