import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

export const healthRouter = Router()

/** Flipped true once the database has answered at boot, false while draining. */
let ready = false
export function setReady(value: boolean): void {
  ready = value
}

const startedAt = Date.now()

/** A readiness probe must never hang a platform poller. */
const DB_PROBE_TIMEOUT_MS = 2_000

/**
 * LIVENESS — "is this process alive?"
 *
 * Deliberately touches nothing external. A platform restarts the container when
 * this fails, and restarting cannot fix a database outage — it just turns a
 * degraded service into a crash loop while Neon is briefly unreachable.
 *
 * Cheap enough to poll every few seconds: no I/O, no allocation of note.
 */
healthRouter.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    startedAt: new Date(startedAt).toISOString(),
    env: process.env['NODE_ENV'] ?? 'development',
  })
})

/**
 * READINESS — "should this instance receive traffic?"
 *
 * This is the one to point a load balancer at. It fails while the database is
 * unreachable and while the process is draining, so traffic is routed away
 * without the instance being killed.
 *
 * Note for whoever wires the platform: every poll is a real query, so a 5s
 * interval keeps the Neon compute permanently awake. That removes cold starts
 * and costs compute-hours — a deliberate trade, not an accident.
 */
healthRouter.get('/ready', async (_req, res) => {
  if (!ready) {
    res.status(503).json({ status: 'draining_or_starting', db: 'unknown' })
    return
  }

  const started = Date.now()
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('db probe timed out')), DB_PROBE_TIMEOUT_MS),
      ),
    ])
    res.status(200).json({ status: 'ready', db: 'up', dbLatencyMs: Date.now() - started })
  } catch (err) {
    res.status(503).json({
      status: 'degraded',
      db: 'down',
      dbLatencyMs: Date.now() - started,
      reason: err instanceof Error ? err.message : 'unknown',
    })
  }
})
