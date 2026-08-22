import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

export const healthRouter = Router()

healthRouter.get('/', async (_req, res) => {
  // Actually touch the database: a process that is up but cannot reach Neon is
  // not healthy, and reporting "ok" would hide the only failure that matters.
  let db: 'up' | 'down' = 'up'
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    db = 'down'
  }

  res.status(db === 'up' ? 200 : 503).json({
    status: db === 'up' ? 'ok' : 'degraded',
    db,
    uptime: Math.round(process.uptime()),
  })
})
