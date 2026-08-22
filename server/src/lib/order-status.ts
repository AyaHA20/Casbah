import type { OrderStatus } from '../../generated/prisma/enums.js'

/**
 * Legal status moves. Terminal states stay terminal, with one exception:
 * DELIVERED -> RETURNED, because in COD a delivered parcel coming back is the
 * normal path, not an edge case.
 *
 * Two deliberate blocks:
 *
 *   CANCELLED -> RETURNED   CANCELLED means it never reached the customer;
 *                           RETURNED means it did and came back. Allowing the
 *                           move would let cancelled orders be counted as
 *                           returns, which quietly destroys the return-rate
 *                           figure the shop actually runs on.
 *
 *   SHIPPED -> CANCELLED    Once a parcel is out, it coming back IS a retour.
 *                           Forcing RETURNED keeps that distinction honest.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  RETURNED: [],
  CANCELLED: [],
}

/** The two states that put stock back on the shelf. */
export const RESTORING_STATUSES: readonly OrderStatus[] = ['CANCELLED', 'RETURNED']

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}

export const STATUS_LABEL_FR: Record<OrderStatus, string> = {
  PENDING: 'Nouvelle',
  CONFIRMED: 'Confirmée',
  SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée',
  RETURNED: 'Retour',
  CANCELLED: 'Annulée',
}
