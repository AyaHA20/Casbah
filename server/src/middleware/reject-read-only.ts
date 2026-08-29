import type { RequestHandler } from 'express'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'

/**
 * Blocks every write for an account flagged `readOnly` — the public demo login.
 *
 * Two deliberate choices:
 *
 * 1. **Method-based, not a route allow-list.** Anything that is not GET or HEAD
 *    is a write. A list of protected routes would have to be extended every
 *    time a route is added, and the one that got forgotten would be the hole.
 *    This is closed by default: a new endpoint is guarded the day it is written.
 *
 * 2. **Checked against the database, not the JWT.** A claim baked into the
 *    token would keep working for the rest of its 12h life after the flag was
 *    set, and tokens minted before the flag existed would carry nothing at all.
 *    The lookup only runs on writes, so reads — the whole of a demo visit — pay
 *    nothing for it.
 */
export const rejectReadOnly: RequestHandler = (req, _res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    next()
    return
  }

  const id = req.admin?.sub
  if (id === undefined) {
    // requireAdmin runs first, so this is unreachable; failing closed rather
    // than assuming is the only safe way to be wrong about that.
    next(new HttpError(401, 'UNAUTHORIZED', 'Session expirée ou invalide. Reconnectez-vous.'))
    return
  }

  prisma.user
    .findUnique({ where: { id }, select: { readOnly: true } })
    .then((user) => {
      if (!user) {
        next(new HttpError(401, 'UNAUTHORIZED', 'Session expirée ou invalide. Reconnectez-vous.'))
        return
      }
      if (user.readOnly) {
        next(
          new HttpError(
            403,
            'DEMO_READ_ONLY',
            'Compte démo — lecture seule. Cette action n’est pas enregistrée.',
          ),
        )
        return
      }
      next()
    })
    .catch(next)
}
