import type { RequestHandler } from 'express'
import { HttpError } from '../lib/http-error.js'
import { verifyAdminToken } from '../lib/jwt.js'

/**
 * Gate for every /api/admin route except login.
 *
 * Deliberately gives the same 401 for a missing, malformed, expired and forged
 * token: telling a caller *why* their token failed helps an attacker more than
 * it helps a real admin, who only ever needs "log in again".
 */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null

  const claims = token ? verifyAdminToken(token) : null
  if (!claims) {
    next(new HttpError(401, 'UNAUTHORIZED', 'Session expirée ou invalide. Reconnectez-vous.'))
    return
  }

  req.admin = claims
  next()
}
