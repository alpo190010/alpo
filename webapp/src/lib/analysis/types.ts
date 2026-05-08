/* ══════════════════════════════════════════════════════════════
   Types — 18 Dimensions
   ══════════════════════════════════════════════════════════════ */

/** Whether a dimension is evaluated once per store or once per product page. */
export type DimensionScope = "store" | "product";

/** Plan tier for feature gating. */
export type PlanTier = "free" | "insights" | "fixes";

export interface CategoryScores {
  pageSpeed: number;
  images: number;
  socialProof: number;
  checkout: number;
  mobileCta: number;
  title: number;
  aiDiscoverability: number;
  structuredData: number;
  pricing: number;
  description: number;
  shipping: number;
  crossSell: number;
  trust: number;
  socialCommerce: number;
  sizeGuide: number;
  variantUx: number;
  accessibility: number;
  contentFreshness: number;
}

export interface CompetitorResult {
  competitors: Array<{
    name: string;
    url: string;
    score: number;
    summary: string;
    categories: CategoryScores;
  }>;
}

export interface SocialProofSignals {
  reviewApp: string | null;
  starRating: number | null;
  reviewCount: number | null;
  hasPhotoReviews: boolean;
  hasVideoReviews: boolean;
  starRatingAboveFold: boolean;
  hasReviewFiltering: boolean;
}

export interface StructuredDataSignals {
  hasProductSchema: boolean;
  hasName: boolean;
  hasImage: boolean;
  hasDescription: boolean;
  hasOffers: boolean;
  hasPrice: boolean;
  hasPriceCurrency: boolean;
  hasAvailability: boolean;
  hasBrand: boolean;
  hasSku: boolean;
  hasGtin: boolean;
  hasAggregateRating: boolean;
  hasPriceValidUntil: boolean;
  hasShippingDetails: boolean;
  hasReturnPolicy: boolean;
  hasBreadcrumbList: boolean;
  hasOrganization: boolean;
  hasMissingBrand: boolean;
  hasCurrencyInPrice: boolean;
  hasInvalidAvailability: boolean;
  jsonParseErrors: number;
  duplicateProductCount: number;
}

export interface CheckoutWalletFlags {
  shopPay: boolean;
  applePay: boolean;
  googlePay: boolean;
  paypal: boolean;
  amazonPay: boolean;
  metaPay: boolean;
  stripeLink: boolean;
}

export interface CheckoutBnplFlags {
  klarna: boolean;
  afterpay: boolean;
  clearpay: boolean;
  affirm: boolean;
  sezzle: boolean;
  shopPayInstallments: boolean;
  zip: boolean;
}

export interface CheckoutSignals {
  // Legacy PDP-derived fields (always present for back-compat)
  hasAcceleratedCheckout: boolean;
  hasDynamicCheckoutButton: boolean;
  hasPaypal: boolean;
  hasKlarna: boolean;
  hasAfterpay: boolean;
  hasAffirm: boolean;
  hasSezzle: boolean;
  paymentMethodCount: number;
  hasDrawerCart: boolean;
  hasAjaxCart: boolean;
  hasStickyCheckout: boolean;
  // Ground-truth fields from the real checkout page (optional —
  // absent on legacy cached rows and when the flow failed)
  reachedCheckout?: boolean;
  failureReason?: string | null;
  checkoutFlavor?: "onepage" | "classic" | "unknown";
  wallets?: CheckoutWalletFlags;
  bnpl?: CheckoutBnplFlags;
  cardBrands?: string[];
  guestCheckoutAvailable?: boolean;
  forcedAccountCreation?: boolean;
  checkoutStepCount?: number;
  totalFormFieldsStepOne?: number;
  hasDiscountCodeField?: boolean;
  hasGiftCardField?: boolean;
  hasShippingCalculator?: boolean;
  hasAddressAutocomplete?: boolean;
  trustBadgeCount?: number;
  currencyCode?: string | null;
}

export interface PricingSignals {
  hasCompareAtPrice: boolean;
  hasStrikethroughPrice: boolean;
  priceValue: number | null;
  hasCharmPricing: boolean;
  isRoundPrice: boolean;
  hasCountdownTimer: boolean;
  hasScarcityMessaging: boolean;
  hasFakeTimerRisk: boolean;
  hasKlarnaPlacement: boolean;
  hasAfterPayBadge: boolean;
  hasShopPayInstallments: boolean;
  hasBnplNearPrice: boolean;
}

export interface ImageSignals {
  imageCount: number;
  hasVideo: boolean;
  has360View: boolean;
  hasZoom: boolean;
  hasLifestyleImages: boolean;
  cdnHosted: boolean;
  hasModernFormat: boolean;
  hasHighRes: boolean;
  altTextScore: number;
}

export interface TitleSignals {
  h1Text: string | null;
  metaTitle: string | null;
  brandName: string | null;
  h1Count: number;
  h1Length: number;
  metaTitleLength: number;
  hasH1: boolean;
  hasSingleH1: boolean;
  hasBrandInTitle: boolean;
  hasKeywordStuffing: boolean;
  isAllCaps: boolean;
  hasPromotionalText: boolean;
  h1MetaDiffer: boolean;
  hasSpecifics: boolean;
}

export interface ShippingSignals {
  hasFreeShipping: boolean;
  hasFreeShippingThreshold: boolean;
  freeShippingThresholdValue: number | null;
  hasDeliveryDate: boolean;
  hasDeliveryEstimate: boolean;
  hasEddApp: boolean;
  hasShippingCostShown: boolean;
  hasShippingInStructuredData: boolean;
  hasShippingPolicyLink: boolean;
  hasReturnsMentioned: boolean;
}

export interface DescriptionSignals {
  descriptionFound: boolean;
  wordCount: number;
  fleschKincaidGrade: number;
  avgSentenceLength: number;
  sentenceCount: number;
  benefitRatio: number;
  benefitWordCount: number;
  featureWordCount: number;
  emotionalDensity: number;
  htmlTagVariety: number;
  hasHeadings: boolean;
  hasBulletLists: boolean;
  hasEmphasis: boolean;
}

export interface TrustSignals {
  trustBadgeApp: string | null;
  trustBadgeCount: number;
  hasPaymentIcons: boolean;
  hasMoneyBackGuarantee: boolean;
  hasReturnPolicy: boolean;
  hasFreeShippingBadge: boolean;
  hasSecureCheckoutText: boolean;
  hasSecurityBadge: boolean;
  hasSafeCheckoutBadge: boolean;
  hasLiveChat: boolean;
  hasPhoneNumber: boolean;
  hasContactEmail: boolean;
  hasTrustNearAtc: boolean;
  trustElementCount: number;
}

/** Lab + field metrics from PSI's desktop Lighthouse strategy.
 *  Mirrors the 9 PSI fields on PageSpeedSignals. Mobile is canonical
 *  for scoring; desktop is exposed only for the scorecard's
 *  Mobile/Desktop toggle. Null when desktop PSI wasn't run or failed. */
export interface PageSpeedDesktopSignals {
  performanceScore: number | null;
  lcpMs: number | null;
  clsValue: number | null;
  tbtMs: number | null;
  fcpMs: number | null;
  speedIndexMs: number | null;
  hasFieldData: boolean;
  fieldLcpMs: number | null;
  fieldClsValue: number | null;
}

export interface PageSpeedSignals {
  /**
   * True while the synchronous scan response was returned but the PSI
   * (Lighthouse lab + CrUX field) data is still being fetched in the
   * background. Frontend polls GET /store/{domain} every ~5 s until this
   * flips to false. When false, the score is final (PSI either succeeded
   * or `psiFailed` is set).
   */
  psiPending?: boolean;
  /** True when the background PSI fetch ultimately failed (timeout / API error). */
  psiFailed?: boolean;
  scriptCount: number;
  thirdPartyScriptCount: number;
  renderBlockingScriptCount: number;
  appScriptCount: number;
  hasLazyLoading: boolean;
  lcpImageLazyLoaded: boolean;
  hasExplicitImageDimensions: boolean;
  hasModernImageFormats: boolean;
  hasFontDisplaySwap: boolean;
  hasPreconnectHints: boolean;
  hasDnsPrefetch: boolean;
  hasHeroPreload: boolean;
  inlineCssKb: number;
  detectedTheme: string | null;
  performanceScore: number | null;
  lcpMs: number | null;
  clsValue: number | null;
  tbtMs: number | null;
  fcpMs: number | null;
  speedIndexMs: number | null;
  hasFieldData: boolean;
  fieldLcpMs: number | null;
  fieldClsValue: number | null;
  desktop: PageSpeedDesktopSignals | null;
}

export interface MobileCtaSignals {
  ctaFound: boolean;
  ctaText: string | null;
  ctaCount: number;
  ctaSelectorMatched: string | null;
  hasViewportMeta: boolean;
  hasResponsiveMeta: boolean;
  hasStickyClass: boolean;
  hasStickyApp: string | null;
  buttonWidthPx: number | null;
  buttonHeightPx: number | null;
  meetsMin44px: boolean | null;
  meetsOptimal60_72px: boolean | null;
  aboveFold: boolean | null;
  isSticky: boolean | null;
  inThumbZone: boolean | null;
  isFullWidth: boolean | null;
}

export interface CrossSellSignals {
  crossSellApp: string | null;
  hasCrossSellSection: boolean;
  widgetType: string | null;
  productCount: number;
  hasBundlePricing: boolean;
  hasCheckboxSelection: boolean;
  hasAddAllToCart: boolean;
  hasDiscountOnBundle: boolean;
  nearBuyButton: boolean;
  recommendationCountOptimal: boolean;
}

export interface VariantUxSignals {
  hasVariants: boolean;
  hasVisualSwatches: boolean;
  hasPillButtons: boolean;
  hasDropdownSelectors: boolean;
  colorSelectorType: string | null;
  sizeSelectorType: string | null;
  optionGroupCount: number;
  hasStockIndicator: boolean;
  hasPreciseStockCount: boolean;
  hasLowStockUrgency: boolean;
  hasSoldOutHandling: boolean;
  hasNotifyMe: boolean;
  swatchApp: string | null;
  hasVariantImageLink: boolean;
  colorUsesDropdown: boolean;
}

export interface AiDiscoverabilitySignals {
  robotsTxtExists: boolean | null;
  aiSearchBotsAllowedCount: number;
  aiTrainingBotsBlockedCount: number;
  hasOaiSearchbotAllowed: boolean;
  hasPerplexitybotAllowed: boolean;
  hasClaudeSearchbotAllowed: boolean;
  hasWildcardBlock: boolean;
  llmsTxtExists: boolean | null;
  hasOgType: boolean;
  hasOgTitle: boolean;
  hasOgDescription: boolean;
  hasOgImage: boolean;
  hasProductPriceAmount: boolean;
  hasProductPriceCurrency: boolean;
  ogTagCount: number;
  hasStructuredSpecs: boolean;
  hasSpecTable: boolean;
  hasFaqContent: boolean;
  specMentionCount: number;
  hasMeasurementUnits: boolean;
  entityDensityScore: number;
}

export interface SizeGuideSignals {
  sizeGuideApp: string | null;
  hasSizeGuideLink: boolean;
  hasSizeGuidePopup: boolean;
  hasSizeChartTable: boolean;
  hasFitFinder: boolean;
  hasModelMeasurements: boolean;
  hasFitRecommendation: boolean;
  hasMeasurementInstructions: boolean;
  nearSizeSelector: boolean;
  categoryApplicable: boolean;
}

export interface ContentFreshnessSignals {
  copyrightYear: number | null;
  copyrightYearIsCurrent: boolean;
  hasExpiredPromotion: boolean;
  expiredPromotionText: string | null;
  hasSeasonalMismatch: boolean;
  hasNewLabel: boolean;
  datePublishedIso: string | null;
  newLabelIsStale: boolean;
  mostRecentReviewDateIso: string | null;
  reviewAgeDays: number | null;
  reviewStaleness: string | null;
  dateModifiedIso: string | null;
  dateModifiedAgeDays: number | null;
  lastModifiedHeader: string | null;
  lastModifiedAgeDays: number | null;
  timeElementCount: number;
  mostRecentTimeIso: string | null;
  mostRecentTimeAgeDays: number | null;
  freshestSignalAgeDays: number | null;
}

export interface SocialCommerceSignals {
  hasInstagramEmbed: boolean;
  hasTiktokEmbed: boolean;
  hasPinterest: boolean;
  hasUgcGallery: boolean;
  ugcGalleryApp: string | null;
  platformCount: number;
}

export interface AccessibilitySignals {
  contrastViolations: number;
  altTextViolations: number;
  formLabelViolations: number;
  emptyLinkViolations: number;
  emptyButtonViolations: number;
  documentLanguageViolations: number;
  totalViolations: number;
  totalNodesAffected: number;
  criticalCount: number;
  seriousCount: number;
  moderateCount: number;
  minorCount: number;
  scanCompleted: boolean;
}

export interface DimensionSignals {
  socialProof?: SocialProofSignals;
  structuredData?: StructuredDataSignals;
  checkout?: CheckoutSignals;
  pricing?: PricingSignals;
  images?: ImageSignals;
  title?: TitleSignals;
  shipping?: ShippingSignals;
  description?: DescriptionSignals;
  trust?: TrustSignals;
  pageSpeed?: PageSpeedSignals;
  mobileCta?: MobileCtaSignals;
  crossSell?: CrossSellSignals;
  variantUx?: VariantUxSignals;
  sizeGuide?: SizeGuideSignals;
  aiDiscoverability?: AiDiscoverabilitySignals;
  contentFreshness?: ContentFreshnessSignals;
  accessibility?: AccessibilitySignals;
  socialCommerce?: SocialCommerceSignals;
}

export interface FreeResult {
  score: number;
  summary: string;
  tips: string[];
  /** Per-dimension tips keyed by dimension slug (e.g. socialProof, structuredData) */
  dimensionTips?: Record<string, string[]>;
  categories: CategoryScores;
  productPrice: number;
  productCategory: string;
  signals?: DimensionSignals;
  /** Backend-reported plan tier of the requester. */
  planTier?: PlanTier;
  /** True when remediation prose is gated (free tier). Backend strips it in this case. */
  detailsLocked?: boolean;
  /** True when fix recommendations are gated (free + insights tiers). */
  recommendationsLocked?: boolean;
  /** Remaining scans in the current calendar month. null = unlimited. */
  creditsRemaining?: number | null;
  /**
   * True when the analyzed URL was identified as a Shopify store. When
   * false, the report shows only the 13 dimensions that work precisely
   * on any website — the 5 Shopify-specific dimensions (checkout flow,
   * reviews app, cross-sell, size guide, variant UX) are omitted.
   * Defaults to true when missing (legacy cached rows).
   */
  isShopify?: boolean;
  /**
   * True when the analyzed URL belongs to a site that sells things
   * (Shopify, WooCommerce, custom carts). False means a regular
   * landing page / SaaS / blog / portfolio — the right-hand panel
   * shows a "Pages" tab instead of "Products". Defaults to true
   * (legacy cached rows render as ecommerce).
   */
  isEcommerce?: boolean;
  /**
   * Dimension keys the backend deliberately skipped — populated when
   * ``isShopify`` is false. The frontend uses this to filter leak
   * cards so we don't render placeholders for things we didn't run.
   */
  skippedDimensions?: string[];
}

/** A single failing axe-core rule inside an accessibility check. */
export interface AccessibilityRule {
  /** axe rule id, e.g. ``heading-order``. */
  id: string;
  /** Short human-readable description from axe-core. */
  help: string;
  /** Deep link to the axe-core documentation page for this rule. */
  helpUrl: string;
  /** axe severity: ``critical`` | ``serious`` | ``moderate`` | ``minor``. */
  impact: string;
  /** Number of DOM nodes the rule flagged on the scanned page. */
  nodeCount: number;
}

/** One pass/fail check inside a store-wide dimension's rubric. */
export interface DimensionCheck {
  id: string;
  label: string;
  passed: boolean;
  weight: number;
  detail?: string;
  /**
   * Per-check fix text. When present on a failing row, the UI renders
   * it as an expand/collapse disclosure. Stripped from the response
   * for free-tier users — absent here means "no inline fix" (either
   * free tier, or a dimension not yet migrated from the separate
   * FixSteps panel).
   */
  remediation?: string;
  /**
   * Optional code snippet specific to this check. Rendered inside the
   * expansion drawer with a Copy button. Stripped alongside
   * ``remediation`` for free-tier users.
   */
  code?: string;
  /**
   * Optional structured list of failing rules — currently only emitted
   * by the accessibility "no other violations" catch-all check, where
   * each rule is a long-tail axe-core failure not covered by the
   * named categories. Rendered as a clickable list inside the
   * disclosure drawer.
   */
  rules?: AccessibilityRule[] | null;
  /**
   * Optional Page Speed signals payload. When present on a failing
   * row, the disclosure drawer renders <PageSpeedScorecard> above
   * any remediation/code so the rich CWV tile UI is preserved
   * inside the flat product-page checks list.
   */
  pageSpeedSignals?: PageSpeedSignals;
  /**
   * True when the server stripped per-check fix fields
   * (``remediation`` / ``code``) before sending. The UI uses this
   * to keep the row expandable on non-fixes tiers and render an
   * upgrade-CTA blur in the drawer where the fix would be.
   */
  lockedFix?: boolean;
}

export interface StoreAnalysisData {
  score: number;
  categories: Partial<CategoryScores>; // 7 store-wide keys
  tips: Record<string, string[]>;
  signals?: Partial<DimensionSignals>;
  /** Per-dimension pass/fail checklist (keyed by dimension key). */
  checks?: Partial<Record<string, DimensionCheck[]>>;
  analyzedUrl?: string;
  updatedAt?: string;
  /**
   * True when the store was identified as a Shopify store. False means
   * the 5 Shopify-specific dimensions were skipped — only the universal
   * checks were run. Defaults to true (legacy rows).
   */
  isShopify?: boolean;
  /**
   * True when the analyzed domain is ecommerce (Shopify, WooCommerce,
   * custom carts). False on plain websites (SaaS landing, blog,
   * portfolio, corporate) — the right tab on /scan/{domain} flips
   * from "Products" to "Pages". Defaults to true (legacy rows).
   */
  isEcommerce?: boolean;
  /**
   * Dimension keys deliberately omitted by the backend. Populated when
   * ``isShopify`` is false.
   */
  skippedDimensions?: string[];
  /**
   * Plan tier of the viewer at response time. Null when the caller was
   * anonymous. Mirrors the value `/analyze` returns alongside FreeResult.
   */
  planTier?: PlanTier | null;
  /**
   * True for free / anonymous — the diagnostic surface (`checks` and
   * `signals`) is stripped to null server-side. The UI must render a
   * BlurredPlaceholder; the real data is never shipped.
   */
  detailsLocked?: boolean;
  /**
   * True for any tier below `fixes` — fix recommendations and per-check
   * `code` are stripped server-side. UI shows upgrade affordances.
   */
  recommendationsLocked?: boolean;
}

/** Structured fix payload returned by `GET /fix/{dimensionKey}`. */
export interface DimensionFix {
  dimensionKey: string;
  label: string;
  problem: string;
  revenueGain: string;
  effort: string;
  scope: string;
  /** Empty array when `locked` is true. */
  steps: string[];
  /** Null when `locked` is true or the dimension has no snippet. */
  code: string | null;
  planTier: PlanTier;
  /** True when the caller is on the free tier — frontend should hide steps/code. */
  locked: boolean;
  /**
   * True when the backend filtered ``steps`` against the store's latest scan
   * signals (caller passed ``?domain=`` + was authenticated). False/absent
   * means the steps are the generic worst-case list.
   */
  stepsTailored?: boolean;
}

/** Shape of each entry returned by `buildLeaks` */
export interface LeakCard {
  key: string;
  catScore: number;
  impact: string;
  revenue: string;
  conversionLoss: number;
  tip: string;
  problem: string;
  category: string;
  revenueImpact: string;
}
