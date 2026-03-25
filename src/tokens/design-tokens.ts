/**
 * alpo.ai Design Tokens — Luminous Liquid
 *
 * Single source of truth for all color, typography, spacing, and elevation tokens.
 * CSS custom properties in globals.css are generated from these values.
 * Import this file when you need tokens in JS/TS (e.g. charts, dynamic styles).
 */

// ── Core Palette ──────────────────────────────────────────────

export const colors = {
  // Primary — violet
  primary:            '#7000ff',
  primaryDim:         '#6200e1',
  primaryContainer:   '#af8dff',
  primaryFixed:       '#af8dff',
  primaryFixedDim:    '#a37bff',
  onPrimary:          '#f8f1ff',
  onPrimaryContainer: '#2c006e',
  onPrimaryFixed:     '#000000',
  onPrimaryFixedVariant: '#370085',

  // Secondary — magenta
  secondary:            '#b60055',
  secondaryDim:         '#a0004a',
  secondaryContainer:   '#ffc1ce',
  secondaryFixed:       '#ffc1ce',
  secondaryFixedDim:    '#ffadc0',
  onSecondary:          '#ffeff1',
  onSecondaryContainer: '#900042',
  onSecondaryFixed:     '#6d0030',
  onSecondaryFixedVariant: '#a1004b',

  // Tertiary — indigo
  tertiary:            '#4052b6',
  tertiaryDim:         '#3346a9',
  tertiaryContainer:   '#9eabff',
  tertiaryFixed:       '#9eabff',
  tertiaryFixedDim:    '#8c9cff',
  onTertiary:          '#f3f1ff',
  onTertiaryContainer: '#09228a',
  onTertiaryFixed:     '#000d52',
  onTertiaryFixedVariant: '#182d92',

  // Surfaces
  background:              '#f5f6f9',
  surface:                 '#f5f6f9',
  surfaceBright:           '#f5f6f9',
  surfaceDim:              '#d1d5d9',
  surfaceTint:             '#7000ff',
  surfaceVariant:          '#dadde1',
  surfaceContainer:        '#e6e8ec',
  surfaceContainerHigh:    '#e0e3e6',
  surfaceContainerHighest: '#dadde1',
  surfaceContainerLow:     '#eff1f4',
  surfaceContainerLowest:  '#ffffff',

  // On-colors (text/icons on surfaces)
  onBackground:     '#2c2f31',
  onSurface:        '#2c2f31',
  onSurfaceVariant: '#595c5e',

  // Outline & borders
  outline:        '#75777a',
  outlineVariant: '#abadb0',

  // Error
  error:            '#b41340',
  errorDim:         '#a70138',
  errorContainer:   '#f74b6d',
  onError:          '#ffefef',
  onErrorContainer: '#510017',

  // Inverse (dark surfaces)
  inverseSurface:   '#0c0f11',
  inverseOnSurface: '#9b9da0',
  inversePrimary:   '#a178ff',

  // ── Semantic Aliases ──────────────────────────────────────
  // These map the old token names used across the codebase.
  // Prefer the semantic names in new code.

  /** Status: success */
  success:       '#16a34a',
  successText:   '#15803d',
  successLight:  '#f0fdf4',
  successBorder: '#bbf7d0',

  /** Status: warning */
  warning:      '#d97706',
  warningText:  '#92400e',
  warningLight: '#fffbeb',
} as const;

// ── Legacy Alias Map ──────────────────────────────────────────
// Maps old CSS var names → new Luminous Liquid values.
// Used by globals.css :root block.

export const legacyAliases = {
  '--bg':             colors.background,
  '--surface':        colors.surfaceContainerLowest,
  '--surface-dim':    colors.surfaceContainerLow,
  '--border':         colors.outlineVariant,
  '--track':          colors.surfaceContainerLow,
  '--text-primary':   colors.onSurface,
  '--text-secondary': colors.onSurfaceVariant,
  '--text-tertiary':  colors.outline,
  '--brand':          colors.primary,
  '--brand-light':    '#f3eeff',  // primary @ 8% on background
  '--brand-border':   colors.primaryContainer,
  '--success':        colors.success,
  '--success-text':   colors.successText,
  '--success-light':  colors.successLight,
  '--success-border': colors.successBorder,
  '--warning':        colors.warning,
  '--warning-text':   colors.warningText,
  '--warning-light':  colors.warningLight,
  '--error':          colors.error,
  '--error-text':     colors.error,
  '--error-light':    '#fef2f2',
  '--muted':          colors.onSurfaceVariant,
  '--card':           colors.surfaceContainerLowest,
} as const;

// ── Typography ────────────────────────────────────────────────

export const typography = {
  fontFamily: {
    headline: 'Inter',
    body:     'Inter',
    label:    'Inter',
  },
  scale: {
    displayLg:  { size: '3.5rem',    weight: 900, letterSpacing: '-0.02em', lineHeight: 1.1 },
    headlineLg: { size: '2rem',      weight: 700, letterSpacing: '-0.01em', lineHeight: 1.2 },
    headlineMd: { size: '1.5rem',    weight: 700, letterSpacing: '-0.01em', lineHeight: 1.3 },
    bodyLg:     { size: '1.125rem',  weight: 400, letterSpacing: '0',       lineHeight: 1.6 },
    bodyMd:     { size: '0.875rem',  weight: 400, letterSpacing: '0',       lineHeight: 1.6 },
    bodySm:     { size: '0.8125rem', weight: 400, letterSpacing: '0',       lineHeight: 1.5 },
    labelSm:    { size: '0.6875rem', weight: 600, letterSpacing: '0.05em',  lineHeight: 1.4 },
  },
} as const;

// ── Border Radius ─────────────────────────────────────────────

export const radii = {
  sm:   '0.25rem',
  md:   '0.5rem',
  lg:   '0.75rem',
  xl:   '1rem',
  '2xl': '1.5rem',
  '3xl': '2rem',
  full: '9999px',
} as const;

// ── Elevation ─────────────────────────────────────────────────

export const shadows = {
  /** Ambient glow — floating cards, inputs */
  ambient: '0 20px 40px rgba(0, 0, 0, 0.04), 0 10px 20px rgba(112, 0, 255, 0.03)',
  /** Elevated — modals, dropdowns */
  elevated: '0 25px 50px rgba(0, 0, 0, 0.08), 0 12px 24px rgba(112, 0, 255, 0.04)',
  /** Subtle — cards at rest */
  subtle: '0 2px 8px rgba(0, 0, 0, 0.04)',
} as const;

// ── Gradients ─────────────────────────────────────────────────

export const gradients = {
  /** Primary CTA gradient: violet → magenta */
  liquid: 'linear-gradient(135deg, #7000ff, #b60055)',
  /** Text gradient: horizontal violet → magenta */
  liquidText: 'linear-gradient(to right, #7000ff, #b60055)',
  /** Mesh background: 4-corner radial blobs */
  mesh: [
    'radial-gradient(at 0% 0%, rgba(112, 0, 255, 0.1) 0px, transparent 50%)',
    'radial-gradient(at 100% 0%, rgba(182, 0, 85, 0.1) 0px, transparent 50%)',
    'radial-gradient(at 100% 100%, rgba(64, 82, 182, 0.1) 0px, transparent 50%)',
    'radial-gradient(at 0% 100%, rgba(112, 0, 255, 0.1) 0px, transparent 50%)',
  ].join(', '),
} as const;

// ── Glass ─────────────────────────────────────────────────────

export const glass = {
  background: 'rgba(245, 246, 249, 0.7)',
  blur: '24px',
  blurHover: '32px',
  border: 'rgba(171, 173, 176, 0.15)',
  borderHover: 'rgba(112, 0, 255, 0.3)',
} as const;
