import type { CustomerHistory } from '../../lib/api'
import { useT } from '../../lib/i18n'

/** "1ʳᵉ commande", "3ᵉ commande" — French ordinals. */
function ordinal(n: number, noun: string): string {
  return n === 1 ? `1ʳᵉ ${noun}` : `${n}ᵉ ${noun}`
}

/**
 * Customer signal, escalating by severity.
 *
 *   returned >= 2  ->  rust, chip, warning glyph — confirm by phone before shipping
 *   returned == 1  ->  neutral note
 *   returned == 0  ->  nothing, unless they are a proven repeat buyer (>= 3)
 *
 * Rust is the accent colour and capped at ~5% of a screen, so the alert is a
 * small chip rather than a banner. On a table of 50 rows only the genuinely
 * risky phones carry it, which is what makes it read as an alarm at all —
 * colouring every row would make it noise.
 */
export function CustomerBadge({
  customer,
  size = 'sm',
}: {
  customer: CustomerHistory
  size?: 'sm' | 'md'
}) {
  const { t } = useT()
  const { orderCount, returnedCount } = customer
  if (orderCount === 0) return null

  const text = size === 'md' ? 'text-meta' : 'text-xs'
  const context = `${orderCount} ${t('orders.ordersWord')} · ${returnedCount} ${t('status.RETURNED')}`

  if (returnedCount >= 2) {
    return (
      <span
        title={context}
        className={`inline-flex w-fit items-center gap-1.5 rounded-pill border border-rust bg-rust/10 px-2.5 py-1 font-bold text-rust ${text}`}
      >
        <span aria-hidden>⚠</span>
        {t('orders.returnedN')} {returnedCount} {t('orders.ordersWord')}
      </span>
    )
  }

  if (returnedCount === 1) {
    return (
      <span title={context} className={`w-fit text-ink-soft ${text}`}>
        {t('orders.returnedN')} 1 {t('orders.ordersWord')}
      </span>
    )
  }

  // Clean history, and enough of it to mean something.
  if (orderCount >= 3) {
    return (
      <span title={context} className={`w-fit font-semibold text-green ${text}`}>
        {ordinal(orderCount, t('orders.nth'))}
      </span>
    )
  }

  // First or second order, nothing returned — no signal worth the ink.
  return null
}
