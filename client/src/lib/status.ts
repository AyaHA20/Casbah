import type { OrderStatus } from './api'

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Nouvelle',
  CONFIRMED: 'Confirmée',
  SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée',
  RETURNED: 'Retour',
  CANCELLED: 'Annulée',
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
export const TABS: Array<{ key: 'ALL' | OrderStatus; label: string }> = [
  { key: 'ALL', label: 'Toutes' },
  { key: 'PENDING', label: 'Nouvelles' },
  { key: 'CONFIRMED', label: 'Confirmées' },
  { key: 'SHIPPED', label: 'Expédiées' },
]

export const DELIVERY_LABEL: Record<'DESK' | 'HOME', string> = {
  DESK: 'stop desk',
  HOME: 'domicile',
}

/** "0561881204" -> "0561 88 12 04" for display; the tel: href keeps the digits. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/\D/g, '')}`
}
