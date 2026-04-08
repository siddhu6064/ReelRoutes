/**
 * Design tokens for the Plan from Scratch mobile feature.
 * Matches the web palette so both platforms feel cohesive.
 */

export const Colors = {
  // Primary
  blue:        '#1D6BF3',
  blueSoft:    '#EFF6FF',
  blueBorder:  '#BFDBFE',

  // Semantic
  green:       '#10B981',
  greenSoft:   '#D1FAE5',
  amber:       '#F59E0B',
  amberSoft:   '#FFFBEB',
  amberBorder: '#FDE68A',
  orange:      '#F97316',
  red:         '#EF4444',
  redSoft:     '#FEF2F2',

  // Neutrals
  black:       '#111827',
  gray900:     '#1F2937',
  gray700:     '#374151',
  gray500:     '#6B7280',
  gray400:     '#9CA3AF',
  gray200:     '#E5E7EB',
  gray100:     '#F3F4F6',
  gray50:      '#F9FAFB',
  white:       '#FFFFFF',

  // Badge backgrounds
  famousBg:    '#FEF3C7',
  famousText:  '#92400E',
  priceBg:     '#F3F4F6',
  priceText:   '#374151',
} as const

export const Spacing = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  xxxl: 32,
} as const

export const Radius = {
  sm:   6,
  md:   10,
  lg:   14,
  xl:   20,
  full: 999,
} as const

export const FontSize = {
  xs:   11,
  sm:   13,
  md:   15,
  lg:   17,
  xl:   20,
  xxl:  26,
  xxxl: 32,
} as const

export const FontWeight = {
  regular: '400' as const,
  medium:  '500' as const,
  semibold:'600' as const,
  bold:    '700' as const,
  black:   '800' as const,
}
