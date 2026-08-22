import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../generated/prisma/client.js'
import { env } from '../env.js'

// One client for the whole process. Each PrismaClient opens its own connection
// pool, so constructing one per request would exhaust Neon's connection limit
// within a handful of concurrent checkouts.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })

export const prisma = new PrismaClient({ adapter })
