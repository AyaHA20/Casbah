import type { AdminClaims } from '../lib/jwt.js'

// Lets requireAdmin attach the authenticated admin without handlers casting.
declare global {
  namespace Express {
    interface Request {
      admin?: AdminClaims
    }
  }
}

export {}
