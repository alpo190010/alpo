/* ══════════════════════════════════════════════════════════════
   Types — 18 Dimensions
   ══════════════════════════════════════════════════════════════ */

/** Whether a dimension is evaluated once per store or once per product page. */
export type DimensionScope = "store" | "product";

/** Plan tier for feature gating. */
export type PlanTier = "free" | "starter" | "pro";

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
  planTier?: "free" | "starter" | "pro";
  /** True when fix recommendations are gated (free tier). Backend strips tips in this case. */
  recommendationsLocked?: boolean;
  /** Remaining scans in the current calendar month. null = unlimited. */
  creditsRemaining?: number | null;
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
   * Plan tier of the viewer at response time. Null when the caller was
   * anonymous. Mirrors the value `/analyze` returns alongside FreeResult.
   */
  planTier?: PlanTier | null;
  /**
   * True when free-tier or anonymous — `checks[*].remediation` and `code`
   * are stripped server-side and the UI should show upgrade affordances.
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
