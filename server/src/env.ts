import 'dotenv/config'
import { z } from 'zod'

// Validated once at boot. A missing DATABASE_URL should stop the process here,
// not surface as a confusing Prisma error on the first request.
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  // Refuse to boot on a weak or missing secret rather than signing admin
  // sessions with something guessable.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET doit faire au moins 32 caractères'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

const parsed = EnvSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment — check server/.env:')
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

export const env = parsed.data
