import { prisma } from './prisma.js'

/** How long a Neon compute takes to wake, roughly, plus headroom. */
const ATTEMPTS = 5
const BACKOFF_MS = [0, 1000, 2000, 3000, 4000]

function isReachabilityError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err)
  return /P1001|reach database|ECONNREFUSED|ETIMEDOUT|Connection terminated/i.test(msg)
}

/**
 * Waits for the database to answer, retrying only the errors that mean "not
 * awake yet".
 *
 * Neon suspends idle computes; the first query after a pause takes ~6-7s and
 * can fail outright. Bounded retry turns that into a slow success instead of a
 * hard failure, and anything that is NOT a reachability error (bad password,
 * bad schema) is rethrown immediately rather than retried five times.
 */
export async function waitForDatabase(label = 'db'): Promise<boolean> {
  for (let i = 0; i < ATTEMPTS; i++) {
    if (BACKOFF_MS[i]) await new Promise((r) => setTimeout(r, BACKOFF_MS[i]))
    const started = Date.now()
    try {
      await prisma.$queryRaw`SELECT 1`
      const ms = Date.now() - started
      if (i > 0 || ms > 1000) {
        console.log(`${label}: ready in ${ms}ms${i > 0 ? ` (attempt ${i + 1}/${ATTEMPTS})` : ''}`)
      }
      return true
    } catch (err) {
      if (!isReachabilityError(err)) throw err
      console.warn(`${label}: not reachable (attempt ${i + 1}/${ATTEMPTS}), retrying…`)
    }
  }
  console.error(`${label}: still unreachable after ${ATTEMPTS} attempts — serving anyway, /api/health will report it.`)
  return false
}
