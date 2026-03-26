/**
 * Centralized color palette for HTML email templates.
 *
 * HTML emails cannot reference CSS custom properties — all values must be
 * literal hex strings. Keep these aligned with the design tokens in globals.css.
 *
 * Note: CTA button color unified to brand primary. The request-report
 * route previously used blue (#2563EB) — intentionally aligned to brand.
 */
export const emailPalette = {
  brand: '#27272a',
  brandCta: '#27272a',
  background: '#FAFAFA',
  cardBg: '#ffffff',
  cardBorder: '#E5E7EB',
  textHeading: '#111111',
  textBody: '#374151',
  textMuted: '#6B6B6B',
  textSecondary: '#9CA3AF',
  textTertiary: '#9E9E9E',
  textLabel: '#6B7280',
  success: '#16A34A',
  warning: '#D97706',
  error: '#DC2626',
  promoBg: '#EFF6FF',
  tableBorder: '#F3F4F6',
  tableHeaderBg: '#F9FAFB',
  divider: '#EEEEEE',
} as const;

export type EmailPalette = typeof emailPalette;
