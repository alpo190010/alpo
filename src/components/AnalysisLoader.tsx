"use client";

import { useState, useEffect } from "react";
import { CheckIcon } from "@phosphor-icons/react";

/* ── Product metadata for the preview panel ── */
interface ProductMeta {
  title: string;
  image: string;
  price: string;
  compareAtPrice: string;
  description: string;
  vendor: string;
  images: string[];
}

const STEPS = [
  { icon: "🔍", label: "Fetching your page", sub: "Reading HTML, images, and metadata" },
  { icon: "🖼", label: "Checking visuals", sub: "Image quality, count, and layout" },
  { icon: "✍️", label: "Analyzing copy", sub: "Title, description, and keywords" },
  { icon: "⭐", label: "Evaluating trust signals", sub: "Reviews, badges, and guarantees" },
  { icon: "🛒", label: "Scoring conversions", sub: "CTA, pricing, and urgency" },
  { icon: "📊", label: "Calculating your score", sub: "Compiling results" },
];

/** Extract product handle from a Shopify URL */
function getProductHandle(url: string): string | null {
  const match = url.match(/\/products\/([^/?#]+)/);
  return match?.[1] || null;
}

/** Strip HTML tags for plain text description */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function AnalysisLoader({ url }: { url: string }) {
  const [activeStep, setActiveStep] = useState(0);
  const [product, setProduct] = useState<ProductMeta | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);

  // Step progression
  useEffect(() => {
    const timers = STEPS.map((_, i) =>
      setTimeout(() => setActiveStep(i), i * 3500)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  // Fetch product metadata from Shopify JSON API
  useEffect(() => {
    const handle = getProductHandle(url);
    if (!handle) return;

    const origin = new URL(url).origin;
    let cancelled = false;

    fetch(`${origin}/products/${handle}.json`, {
      headers: { Accept: "application/json" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.product) return;
        const p = data.product;
        const images = (p.images || [])
          .slice(0, 5)
          .map((img: { src: string }) => {
            let src = img.src || "";
            if (src.startsWith("//")) src = `https:${src}`;
            return src;
          })
          .filter(Boolean);

        let mainImage = images[0] || "";
        // Request a medium-sized image for the preview
        if (mainImage.includes("cdn.shopify.com")) {
          mainImage = mainImage.replace(/(\.(jpg|jpeg|png|webp|avif))/i, "_600x$1");
        }

        const variant = p.variants?.[0];
        setProduct({
          title: p.title || "",
          image: mainImage,
          price: variant?.price || p.price || "",
          compareAtPrice: variant?.compare_at_price || "",
          description: stripHtml(p.body_html || "").slice(0, 300),
          vendor: p.vendor || "",
          images: images.map((src: string) =>
            src.includes("cdn.shopify.com")
              ? src.replace(/(\.(jpg|jpeg|png|webp|avif))/i, "_600x$1")
              : src
          ),
        });
      })
      .catch(() => {}); // Non-fatal — we just won't show the preview

    return () => { cancelled = true; };
  }, [url]);

  const truncatedUrl = url.length > 60 ? url.slice(0, 60) + "…" : url;
  const hasProduct = product && (product.image || product.title);

  return (
    <section className="w-full flex justify-center mt-6 sm:mt-10 mb-8 px-4" aria-label="Analysis in progress">
      <div className={`w-full ${hasProduct ? "max-w-[900px]" : "max-w-[480px]"}`}>
        <div className={`flex flex-col ${hasProduct ? "lg:flex-row" : ""} bg-[var(--surface)] border-[1.5px] border-[var(--border)] rounded-2xl overflow-hidden`}>

          {/* ── Left: Product Preview ── */}
          {hasProduct && (
            <div className="lg:w-[380px] shrink-0 border-b lg:border-b-0 lg:border-r border-[var(--border)] bg-[var(--surface-dim)]">
              {/* Product image */}
              {product.images.length > 0 && (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={product.images[selectedImage] || product.image}
                    alt={product.title}
                    className="w-full h-[200px] lg:h-[260px] object-contain bg-white p-4"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  {/* Thumbnail strip */}
                  {product.images.length > 1 && (
                    <div className="flex gap-1.5 px-3 py-2 overflow-x-auto">
                      {product.images.map((img, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setSelectedImage(i)}
                          className={`cursor-pointer w-10 h-10 rounded-lg border-2 overflow-hidden shrink-0 transition-all ${
                            i === selectedImage
                              ? "border-[var(--brand)] ring-1 ring-[var(--brand)]"
                              : "border-[var(--border)] hover:border-[var(--text-tertiary)]"
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Product info */}
              <div className="px-4 py-4">
                {product.vendor && (
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                    {product.vendor}
                  </p>
                )}
                <h3 className="text-sm font-bold text-[var(--text-primary)] leading-snug mb-2 line-clamp-2">
                  {product.title}
                </h3>
                {/* Price */}
                {product.price && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base font-bold text-[var(--text-primary)]">
                      ${Number(product.price).toFixed(2)}
                    </span>
                    {product.compareAtPrice && Number(product.compareAtPrice) > Number(product.price) && (
                      <span className="text-sm text-[var(--text-tertiary)] line-through">
                        ${Number(product.compareAtPrice).toFixed(2)}
                      </span>
                    )}
                  </div>
                )}
                {/* Description excerpt */}
                {product.description && (
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-3">
                    {product.description}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Right: Analysis Progress ── */}
          <div className={`flex-1 px-6 sm:px-8 py-7 sm:py-9 ${hasProduct ? "lg:min-w-[400px]" : ""}`}>
            {/* Header */}
            <div className="text-center mb-7">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1.5">
                Analyzing your page
              </h2>
              <p className="text-[13px] text-[var(--text-tertiary)] truncate">
                {truncatedUrl}
              </p>
            </div>

            {/* Progress bar */}
            <div className="w-full h-[3px] bg-[var(--track)] rounded-sm mb-7 overflow-hidden">
              <div
                className="h-full bg-[var(--brand)] rounded-sm"
                style={{
                  width: `${Math.min(((activeStep + 1) / STEPS.length) * 100, 95)}%`,
                  transition: "width 3s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              />
            </div>

            {/* Steps */}
            <div className="flex flex-col" role="list" aria-label="Analysis steps">
              {STEPS.map((step, i) => {
                const isDone = i < activeStep;
                const isActive = i === activeStep;
                const isPending = i > activeStep;

                return (
                  <div
                    key={step.label}
                    role="listitem"
                    className={`flex items-start gap-3.5 py-3 ${
                      i < STEPS.length - 1 ? "border-b border-[var(--track)]" : ""
                    } ${isPending ? "opacity-40" : "opacity-100"}`}
                    style={{ transition: "opacity 0.4s ease" }}
                  >
                    {/* Status indicator */}
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-base border-[1.5px] ${
                        isDone
                          ? "bg-[var(--success-light)] border-[var(--success-border)]"
                          : isActive
                          ? "bg-[var(--brand-light)] border-[var(--brand-border)]"
                          : "bg-[var(--surface-dim)] border-[var(--border)]"
                      }`}
                      style={{ transition: "all 0.4s ease" }}
                    >
                      {isDone ? (
                        <CheckIcon size={16} weight="bold" color="var(--success)" />
                      ) : isActive ? (
                        <div
                          className="w-3.5 h-3.5 rounded-full border-2 border-[var(--brand)] border-t-transparent"
                          style={{ animation: "spin 0.8s linear infinite" }}
                        />
                      ) : (
                        <span className="opacity-50" aria-hidden="true">{step.icon}</span>
                      )}
                    </div>

                    {/* Text */}
                    <div className="min-w-0">
                      <p
                        className={`text-sm mb-0.5 ${
                          isDone
                            ? "font-medium text-[var(--success-text)]"
                            : isActive
                            ? "font-semibold text-[var(--text-primary)]"
                            : "font-normal text-[var(--text-tertiary)]"
                        }`}
                        style={{ transition: "color 0.4s ease" }}
                      >
                        {step.label}
                        {isDone && <span className="ml-1.5 text-xs text-[var(--success-text)]">Done</span>}
                      </p>
                      {(isActive || isDone) && (
                        <p className="text-xs text-[var(--text-tertiary)]">
                          {step.sub}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Estimated time */}
            <p className="text-xs text-[var(--text-tertiary)] text-center mt-5">
              Usually takes 15–25 seconds
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
