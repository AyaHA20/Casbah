import type { Prisma } from '../../generated/prisma/client.js'

// Arbitrary namespace so this lock can never collide with another advisory
// lock added elsewhere in the app later.
const LOCK_NAMESPACE = 1001

/**
 * Allocates the next order number for the year, e.g. CMD-2026-0001.
 *
 * Must be called inside a transaction. The advisory lock is why two checkouts
 * landing in the same millisecond cannot both read 0007 and both try to write
 * 0008 — the unique constraint would catch that, but one customer would eat an
 * error at the final step of a flow that had otherwise succeeded.
 *
 * `_xact_` means the lock releases on commit or rollback, so there is no
 * cleanup path to forget.
 */
export async function allocateOrderNumber(
  tx: Prisma.TransactionClient,
  year: number,
): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}, ${year})`

  const prefix = `CMD-${year}-`

  const last = await tx.order.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    // Ordered by id, NOT by orderNumber. String ordering would sort
    // CMD-2026-10000 before CMD-2026-9999, and the 10,000th order of the year
    // would reuse a number. Under the lock, the highest id in the year is by
    // definition the last number allocated.
    orderBy: { id: 'desc' },
    select: { orderNumber: true },
  })

  const nextSeq = last ? Number(last.orderNumber.slice(prefix.length)) + 1 : 1

  return `${prefix}${String(nextSeq).padStart(4, '0')}`
}
