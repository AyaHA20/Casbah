export type Lang = 'fr' | 'ar'

/**
 * Prices are Int dinars, grouped with a thin space (U+202F).
 *
 * Digits stay Western in both languages: Algeria and the Maghreb use 0-9 in
 * commerce, unlike the Mashriq. Only the currency word changes.
 */
export function fmtDA(amount: number, lang: Lang = 'fr'): string {
  const grouped = String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${grouped} ${lang === 'ar' ? 'د.ج' : 'DA'}`
}

/** 0561201234 -> "0561 20 12 34", the way the number is read aloud. */
export function fmtPhone(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (d.length !== 10) return raw
  return `${d.slice(0, 4)} ${d.slice(4, 6)} ${d.slice(6, 8)} ${d.slice(8, 10)}`
}

/**
 * Colour names come from the database as French words; the swatches need hex.
 * Anything unmapped falls back to a neutral rather than rendering nothing.
 */
const SWATCHES: Record<string, string> = {
  Noir: '#2E2E2E',
  'Noir délavé': '#3F3F46',
  Anthracite: '#3A3A3A',
  Blanc: '#FFFFFF',
  Ivoire: '#F6F2E4',
  Écru: '#EFE7D6',
  Crème: '#F4F0DB',
  Sable: '#DCCFAE',
  Beige: '#D9C9A8',
  Camel: '#B98A4E',
  Terracotta: '#B4593C',
  Rouille: '#A44A26',
  Bordeaux: '#6E2233',
  'Vert olive': '#4B674F',
  Émeraude: '#1F6B52',
  Kaki: '#6E6A45',
  'Gris chiné': '#9C9C9C',
  'Bleu marine': '#26364F',
  'Bleu brut': '#3A5A82',
  'Bleu ciel': '#A9C6DE',
  'Bleu majorelle': '#2C4A9A',
}

export function swatch(color: string): string {
  return SWATCHES[color] ?? '#C9C4B4'
}

/** Sizes sort S → M → L → XL, not alphabetically. */
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
export function bySize(a: string, b: string): number {
  const ia = SIZE_ORDER.indexOf(a)
  const ib = SIZE_ORDER.indexOf(b)
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
}
