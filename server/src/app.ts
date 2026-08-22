import cors from 'cors'
import express from 'express'
import { env } from './env.js'
import { errorHandler } from './middleware/error-handler.js'
import { notFoundHandler } from './middleware/not-found.js'
import { apiRouter } from './routes/index.js'

export function createApp() {
  const app = express()

  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    }),
  )
  // An order body is a few hundred bytes; the cap keeps a malformed or hostile
  // request from buffering megabytes before validation ever runs.
  app.use(express.json({ limit: '100kb' }))

  app.use('/api', apiRouter)

  // Order matters: 404 for unmatched routes, then the error handler last so it
  // catches everything above it.
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
