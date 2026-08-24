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
  // Optional on purpose: the server must still boot without storage configured.
  // The upload endpoints answer 503 until these are set. SERVICE_ROLE is a
  // server-only secret — it must never be exposed to the client or VITE_-prefixed.
  // The Supabase dashboard shows the REST endpoint (…/rest/v1/) most prominently,
  // but createClient wants the bare project URL and appends its own paths — so a
  // pasted REST URL would send Storage to /rest/v1/storage/v1/… and 404. Trim it.
  SUPABASE_URL: z
    .string()
    .url()
    .optional()
    .transform((u) => u?.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '')),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
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

// Say so out loud rather than silently rewriting the operator's configuration.
const rawSupabaseUrl = process.env['SUPABASE_URL']
if (rawSupabaseUrl && env.SUPABASE_URL && rawSupabaseUrl.replace(/\/+$/, '') !== env.SUPABASE_URL) {
  console.warn(
    `SUPABASE_URL looked like a REST endpoint and was trimmed to ${env.SUPABASE_URL} — ` +
      'consider storing the bare project URL in server/.env.',
  )
}
