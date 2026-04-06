"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  MagnifyingGlassIcon,
  ImageIcon,
  PencilSimpleIcon,
  StarIcon,
  ShoppingCartIcon,
  ChartBarIcon,
  PackageIcon,
} from "@phosphor-icons/react";
import StepProgress from "@/components/analysis/StepProgress";

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
  { icon: <MagnifyingGlassIcon size={16} weight="regular" />, label: "Fetching your page", sub: "Reading HTML, images, and metadata" },
  { icon: <ImageIcon size={16} weight="regular" />, label: "Checking visuals", sub: "Image quality, count, and layout" },
  { icon: <PencilSimpleIcon size={16} weight="regular" />, label: "Analyzing copy", sub: "Title, description, and keywords" },
  { icon: <StarIcon size={16} weight="regular" />, label: "Evaluating trust signals", sub: "Reviews, badges, and guarantees" },
  { icon: <ShoppingCartIcon size={16} weight="regular" />, label: "Scoring conversions", sub: "CTA, pricing, and urgency" },
  { icon: <ChartBarIcon size={16} weight="regular" />, label: "Calculating your score", sub: "Compiling results" },
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
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [takingLong, setTakingLong] = useState(false);

  // Show "taking longer" feedback after 10s
  useEffect(() => {
    const timer = setTimeout(() => setTakingLong(true), 10_000);
    return () => clearTimeout(timer);
  }, []);

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

    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      return;
    }
    const controller = new AbortController();

    function doFetch(signal: AbortSignal) {
      return fetch(`${origin}/products/${handle}.json`, {
        headers: { Accept: "application/json" },
        signal,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (signal.aborted || !data?.product) return;
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
        });
    }

    doFetch(controller.signal)
      .catch((err) => {
        if (controller.signal.aborted) return;
        // Single retry after 2s
        return new Promise<void>((resolve) => setTimeout(resolve, 2000))
          .then(() => { if (!controller.signal.aborted) return doFetch(controller.signal); });
      })
      .catch((err) => { console.warn("Non-fatal: failed to fetch product preview:", err); });

    return () => controller.abort();
  }, [url]);

  const truncatedUrl = url.length > 60 ? url.slice(0, 60) + "…" : url;
  const hasProduct = product && (product.image || product.title);

  return (
    <section className="w-full flex justify-center mt-6 sm:mt-10 mb-8 px-4" aria-label="Analysis in progress" aria-busy={activeStep < STEPS.length - 1}>
      <div className={`w-full ${hasProduct ? "max-w-[900px]" : "max-w-[480px]"}`}>
        <div className={`flex flex-col ${hasProduct ? "lg:flex-row" : ""} bg-[var(--surface)] border-[1.5px] border-[var(--border)] rounded-2xl overflow-hidden`}>

          {/* ── Left: Product Preview ── */}
          {hasProduct && (
            <div className="lg:w-[380px] shrink-0 border-b lg:border-b-0 lg:border-r border-[var(--border)] bg-[var(--surface-dim)]">
              {/* Product image */}
              {product.images.length > 0 && (
                <div className="relative">
                  {imgError ? (
                    <div className="w-full h-[200px] lg:h-[260px] bg-white flex items-center justify-center">
                      <PackageIcon size={48} weight="regular" color="var(--outline)" />
                    </div>
                  ) : (
                    <div className="relative">
                      {!imgLoaded && (
                        <div className="absolute inset-0 w-full h-[200px] lg:h-[260px] bg-[var(--surface-dim)] animate-pulse" />
                      )}
                      <Image
                        src={product.images[selectedImage] || product.image}
                        alt={product.title}
                        width={380}
                        height={260}
                        className="w-full h-[200px] lg:h-[260px] object-contain bg-white p-4"
                        onError={() => setImgError(true)}
                        onLoad={() => setImgLoaded(true)}
                        unoptimized
                      />
                    </div>
                  )}
                  {/* Thumbnail strip */}
                  {product.images.length > 1 && (
                    <div className="flex gap-1.5 px-3 py-2 overflow-x-auto">
                      {product.images.map((img, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => { setSelectedImage(i); setImgError(false); setImgLoaded(false); }}
                          className={`cursor-pointer w-10 h-10 rounded-lg border-2 overflow-hidden shrink-0 transition-all polish-focus-ring ${
                            i === selectedImage
                              ? "border-[var(--brand)] ring-1 ring-[var(--brand)]"
                              : "border-[var(--border)] hover:border-[var(--text-tertiary)]"
                          }`}
                        >
                          <Image src={img} alt="" width={40} height={40} className="w-full h-full object-cover" unoptimized onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
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

            <StepProgress steps={STEPS} activeStep={activeStep} />

            {/* Estimated time */}
            <p className="text-xs text-[var(--text-tertiary)] text-center mt-5">
              Usually takes 15–25 seconds
            </p>
            {takingLong && (
              <p className="text-xs text-[var(--text-tertiary)] text-center mt-2 animate-in fade-in">
                This is taking longer than expected…
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
