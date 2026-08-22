import type { ErrorRequestHandler } from 'express'
import { ZodError } from 'zod'
import { HttpError } from '../lib/http-error.js'

/**
 * Single exit point for every failure. Express 5 forwards rejected async
 * handlers here automatically, so route files never need try/catch.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    })
    return
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Données invalides.',
        details: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
    })
    return
  }

  // Anything reaching here is a bug. Log it in full, but never leak internals
  // to the customer.
  console.error('Unhandled error:', err)
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Une erreur interne est survenue.' },
  })
}
