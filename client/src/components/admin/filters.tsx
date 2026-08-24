import type { ReactNode } from 'react'
import { useT } from '../../lib/i18n'

/**
 * Shared toolbar parts for the admin filter bars.
 *
 * Produits and Stock use the same controls so the two pages read as one
 * system — extracting them is what keeps that true as either page changes.
 */

export const FIELD =
  'rounded-[12px] border border-line bg-field px-[14px] py-[11px] text-sm outline-none focus:border-green'

export const FIELD_TIGHT =
  'rounded-[12px] border border-line bg-field px-3 py-[9px] text-sm outline-none focus:border-green'

/** Accent- and case-insensitive, so "setif" finds "Sétif". */
export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      {...(title ? { title } : {})}
      className={`whitespace-nowrap rounded-pill border px-3.5 py-[7px] text-meta font-semibold ${
        active ? 'border-green bg-green text-cream' : 'border-line text-ink-soft hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Sort control that always shows which way it is pointing.
 *
 * `direction: null` means this control is not the active sort — it still shows
 * an arrow so the button never looks broken, just muted.
 */
export function SortToggle({
  label,
  direction,
  onToggle,
}: {
  label: string
  direction: 'asc' | 'desc' | null
  onToggle: () => void
}) {
  const { t } = useT()
  const active = direction !== null
  const arrow = direction === 'desc' ? '↓' : '↑'
  const meaning = direction === 'desc' ? t('filters.sortDesc') : t('filters.sortAsc')

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      title={`${label} · ${active ? meaning : t('filters.sortAsc')}`}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-3.5 py-[7px] text-meta font-semibold ${
        active ? 'border-green bg-green text-cream' : 'border-line text-ink-soft hover:text-ink'
      }`}
    >
      {label}
      <span aria-hidden className="text-[13px] leading-none">
        {arrow}
      </span>
      <span className="sr-only">{active ? meaning : 'inactif'}</span>
    </button>
  )
}

export function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-label font-semibold uppercase text-ink-soft">{label}</span>
      {children}
    </div>
  )
}

/**
 * Live result count plus the reset affordance.
 *
 * `loadedCeiling` exists because both pages filter in the browser over a fetched
 * page. If the server had more rows than were loaded, saying "3 résultats"
 * without qualification would be a quiet lie.
 */
export function FilterSummary({
  count,
  noun,
  active,
  onReset,
  extra,
  loadedCeiling,
}: {
  count: number
  noun: [singular: string, plural: string]
  active: boolean
  onReset: () => void
  extra?: ReactNode
  loadedCeiling?: { loaded: number; total: number }
}) {
  const { t } = useT()
  const truncated = loadedCeiling && loadedCeiling.total > loadedCeiling.loaded

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-meta text-ink-soft">
        {count} {count > 1 ? noun[1] : noun[0]}
        {extra}
      </p>
      {active && (
        <button type="button" onClick={onReset} className="text-meta text-green hover:text-rust">
          {t('filters.reset')}
        </button>
      )}
      {truncated && (
        <span className="text-meta text-rust">
          {t('filters.truncated')} {loadedCeiling.loaded} {t('filters.of')} {loadedCeiling.total}.
        </span>
      )}
    </div>
  )
}
