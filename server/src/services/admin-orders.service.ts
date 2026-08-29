import { prisma } from '../lib/prisma.js'
import { HttpError, badRequest, conflict, notFound } from '../lib/http-error.js'
import {
  ALLOWED_TRANSITIONS,
  RESTORING_STATUSES,
  STATUS_LABEL_FR,
  canTransition,
} from '../lib/order-status.js'
import type { OrderListQuery } from '../schemas/admin.schema.js'
import type { OrderStatus } from '../../generated/prisma/enums.js'

export type CustomerHistory = { orderCount: number; returnedCount: number }

const EMPTY_HISTORY: CustomerHistory = { orderCount: 0, returnedCount: 0 }

/**
 * Order history keyed by phone, for a batch of phones at once.
 *
 * COD buyers never register, so the phone number IS the customer identity.
 * One groupBy covers every phone on the page — doing this per row would be an
 * N+1 that grows with page size.
 */
async function phoneHistory(phones: string[]): Promise<Record<string, CustomerHistory>> {
  const unique = [...new Set(phones)]
  if (unique.length === 0) return {}

  const grouped = await prisma.order.groupBy({
    by: ['phone', 'status'],
    where: { phone: { in: unique } },
    _count: { _all: true },
  })

  const out: Record<string, CustomerHistory> = {}
  for (const row of grouped) {
    const entry = (out[row.phone] ??= { orderCount: 0, returnedCount: 0 })
    entry.orderCount += row._count._all
    if (row.status === 'RETURNED') entry.returnedCount += row._count._all
  }
  return out
}

export async function listOrders(query: OrderListQuery) {
  const where = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.phone ? { phone: { contains: query.phone.replace(/\s/g, '') } } : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' }, // newest first
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        phone: true,
        total: true,
        status: true,
        deliveryType: true,
        createdAt: true,
        // nameAr too: the admin renders wilaya names in the active language.
        wilaya: { select: { code: true, nameFr: true, nameAr: true } },
        commune: { select: { name: true } },
      },
    }),
  ])

  // Customer history for every phone on this page, in ONE query regardless of
  // page size. Buyers have no accounts, so the phone number is the identity.
  const history = await phoneHistory(rows.map((r) => r.phone))

  // Tab counts, so the filter pills can show numbers without a second request.
  const grouped = await prisma.order.groupBy({ by: ['status'], _count: { _all: true } })
  const countsByStatus = Object.fromEntries(
    grouped.map((g) => [g.status, g._count._all]),
  ) as Partial<Record<OrderStatus, number>>

  return {
    data: rows.map((r) => ({ ...r, customer: history[r.phone] ?? EMPTY_HISTORY })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
    counts: {
      all: grouped.reduce((n, g) => n + g._count._all, 0),
      byStatus: countsByStatus,
    },
  }
}

export async function getOrder(id: number) {
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      phone: true,
      address: true,
      deliveryType: true,
      subtotal: true,
      shipping: true,
      total: true,
      status: true,
      notes: true,
      stockRestored: true,
      createdAt: true,
      updatedAt: true,
      wilaya: { select: { code: true, nameFr: true, nameAr: true } },
      commune: { select: { id: true, name: true } },
      items: {
        select: {
          id: true,
          variantId: true,
          quantity: true,
          unitPrice: true,
          productName: true,
          variantSize: true,
          variantColor: true,
          imageUrl: true,
          sku: true,
        },
      },
    },
  })
  if (!order) throw notFound(`Commande introuvable : ${id}`)

  const history = await phoneHistory([order.phone])

  // Only offer moves the transaction would actually accept.
  return {
    ...order,
    allowedTransitions: ALLOWED_TRANSITIONS[order.status],
    customer: history[order.phone] ?? EMPTY_HISTORY,
  }
}

export async function changeStatus(id: number, next: OrderStatus) {
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      stockRestored: true,
      items: { select: { variantId: true, quantity: true, sku: true } },
    },
  })
  if (!order) throw notFound(`Commande introuvable : ${id}`)

  const current = order.status
  if (current === next) {
    throw badRequest('SAME_STATUS', `La commande est déjà « ${STATUS_LABEL_FR[next]} ».`)
  }
  if (!canTransition(current, next)) {
    throw badRequest(
      'INVALID_TRANSITION',
      `Passage impossible de « ${STATUS_LABEL_FR[current]} » à « ${STATUS_LABEL_FR[next]} ».`,
      { from: current, to: next, allowed: ALLOWED_TRANSITIONS[current] },
    )
  }

  const restores = RESTORING_STATUSES.includes(next)

  // ---------------------------------------------------------------------------
  // This must be all-or-nothing, for the mirror-image reason order creation is.
  //
  // Cancelling or accepting a return puts stock back on the shelf. If the status
  // moved but the stock did not, the shop under-sells goods it actually has. If
  // the stock moved but the status did not, the next admin cancels again and
  // puts it back twice — inventory the shop cannot fulfil.
  //
  // The extra hazard here is that an order can legitimately reach BOTH
  // restoring states (cancelled, then returned). `stockRestored` is the latch
  // that makes the restore happen exactly once across all of them.
  // ---------------------------------------------------------------------------
  return prisma.$transaction(
    async (tx) => {
      if (restores) {
        // The claim IS the check. `stockRestored: false` in the where clause
        // means only one caller can ever win this update, so two admins hitting
        // "Annulée" at the same instant cannot both go on to restore. Same
        // shape as the `stock: { gte: quantity }` guard in orders.service.ts —
        // the guard just moved from the stock column to the latch.
        const claimed = await tx.order.updateMany({
          where: { id, status: current, stockRestored: false },
          data: { status: next, stockRestored: true },
        })

        if (claimed.count === 1) {
          for (const item of order.items) {
            // variantId is nullable (onDelete: SetNull). A variant deleted since
            // the order was placed has nowhere to put the stock back.
            if (item.variantId === null) continue
            await tx.variant.update({
              where: { id: item.variantId },
              data: { stock: { increment: item.quantity } },
            })
          }

          return { restored: true, skippedLines: order.items.filter((i) => i.variantId === null).length }
        }
        // Lost the claim: either stock was already restored by an earlier
        // cancellation, or another admin moved the order first. Fall through to
        // the plain guarded move below, which tells the two apart.
      }

      const moved = await tx.order.updateMany({
        where: { id, status: current },
        data: { status: next },
      })
      if (moved.count === 0) {
        // `status: current` no longer matched — someone changed it between our
        // read and our write.
        throw conflict(
          'STATUS_CHANGED',
          'Cette commande vient d\'être modifiée ailleurs. Rechargez la page.',
        )
      }

      return { restored: false, skippedLines: 0 }
    },
    { timeout: 15_000, maxWait: 5_000 },
  ).then(async (outcome) => {
    const fresh = await getOrder(id)
    return { ...fresh, stockRestoredNow: outcome.restored, skippedLines: outcome.skippedLines }
  })
}

export async function stats() {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const sevenDaysAgo = new Date(startOfToday)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6) // today plus the six before it

  const [pending, collected, totalOrders, returned, ordersToday] = await Promise.all([
    prisma.order.count({ where: { status: 'PENDING' } }),
    // "Encaissé" means money actually handed over, so only DELIVERED counts.
    prisma.order.aggregate({
      _sum: { total: true },
      where: { status: 'DELIVERED', createdAt: { gte: sevenDaysAgo } },
    }),
    prisma.order.count(),
    prisma.order.count({ where: { status: 'RETURNED' } }),
    prisma.order.count({ where: { createdAt: { gte: startOfToday } } }),
  ])

  return {
    pending,
    collected7d: collected._sum.total ?? 0,
    // Share of all orders that came back. 0 when there are no orders at all,
    // rather than NaN.
    returnRate: totalOrders === 0 ? 0 : returned / totalOrders,
    returned,
    totalOrders,
    ordersToday,
  }
}

export function assertKnownStatus(value: string): OrderStatus {
  if (!(value in STATUS_LABEL_FR)) {
    throw new HttpError(400, 'UNKNOWN_STATUS', `Statut inconnu : ${value}`)
  }
  return value as OrderStatus
}
