import jwt from 'jsonwebtoken'
import { env } from '../env.js'

const TTL = '12h'

export type AdminClaims = { sub: number; email: string }

export function signAdminToken(claims: AdminClaims): string {
  return jwt.sign(claims, env.JWT_SECRET, { expiresIn: TTL })
}

/** Returns null on anything wrong — expired, tampered, malformed. */
export function verifyAdminToken(token: string): AdminClaims | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET)
    if (typeof payload === 'string') return null
    const sub = payload['sub']
    const email = payload['email']
    if (typeof sub !== 'number' || typeof email !== 'string') return null
    return { sub, email }
  } catch {
    return null
  }
}
