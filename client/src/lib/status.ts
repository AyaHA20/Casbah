import type { OrderStatus } from './api'
import type { Dict } from './dictionary'

/**
 * Status and delivery labels resolve through the dictionary, so they follow the
 * active language. Keys, not strings, so a rename is a compile error.
 */
export const STATUS_KEY: Record<OrderStatus, keyof Dict> = {
  PENDING: 'status.PENDING',
  CONFIRMED: 'status.CONFIRMED',
  SHIPPED: 'status.SHIPPED',
  DELIVERED: 'status.DELIVERED',
  RETURNED: 'status.RETURNED',
  CANCELLED: 'status.CANCELLED',
}

/**
 * Colour carries meaning here, so it stays sparse: green for the states that
 * still need the shop's attention, rust only for the two that lost the sale.
 * Everything settled is plain ink-soft — this is what keeps rust under ~5%.
 */
export const STATUS_TONE: Record<OrderStatus, string> = {
  PENDING: 'text-green',
  CONFIRMED: 'text-green',
  SHIPPED: 'text-ink-soft',
  DELIVERED: 'text-ink-soft',
  RETURNED: 'text-rust',
  CANCELLED: 'text-rust',
}

/** The four tabs the design shows, in its order. */
export const TABS: Array<{ key: 'ALL' | OrderStatus; labelKey: keyof Dict }> = [
  { key: 'ALL', labelKey: 'orders.tabAll' },
  { key: 'PENDING', labelKey: 'status.PENDING' },
  { key: 'CONFIRMED', labelKey: 'status.CONFIRMED' },
  { key: 'SHIPPED', labelKey: 'status.SHIPPED' },
]

/**
 * The two statuses that put stock back on the shelf. Both are terminal, so the
 * admin confirms before either — mirrors RESTORING_STATUSES on the server.
 */
export const RESTORING_STATUSES: readonly OrderStatus[] = ['CANCELLED', 'RETURNED']

export const DELIVERY_KEY: Record<'DESK' | 'HOME', keyof Dict> = {
  DESK: 'checkout.desk',
  HOME: 'checkout.home',
}

/** "0561881204" -> tel: href; the digits are what a dialler needs. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/\D/g, '')}`
}
