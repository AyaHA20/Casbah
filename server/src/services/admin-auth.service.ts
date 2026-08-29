import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../lib/http-error.js'
import { signAdminToken } from '../lib/jwt.js'
import type { LoginBody } from '../schemas/admin.schema.js'

/** Same error for unknown email and wrong password, so login cannot be used to
 *  find out which addresses are admin accounts. */
const REJECT = new HttpError(401, 'BAD_CREDENTIALS', 'E-mail ou mot de passe incorrect.')

export async function login(input: LoginBody) {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    select: { id: true, email: true, name: true, passwordHash: true, readOnly: true },
  })

  // Hash even when the user does not exist: comparing against a dummy keeps the
  // response time flat, so timing cannot reveal which emails are registered.
  const hash = user?.passwordHash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi'
  const ok = await bcrypt.compare(input.password, hash)

  if (!user || !ok) throw REJECT

  return {
    token: signAdminToken({ sub: user.id, email: user.email }),
    // readOnly is returned for the UI to label itself. It is NOT what enforces
    // anything — the middleware re-reads the column on every write.
    admin: { id: user.id, email: user.email, name: user.name, readOnly: user.readOnly },
  }
}
