import 'dotenv/config'
import bcrypt from 'bcrypt'
import type { OrderStatus } from '../generated/prisma/client.js'
import { prisma } from '../src/lib/prisma.js'
import { galleriesForProducts, resolveGallery } from '../src/services/product-images.service.js'

/**
 * Demo data: ~20 orders and one read-only admin, for showing the dashboard.
 *
 * Deliberately separate from prisma/seed.ts. This script NEVER writes products,
 * variants, categories, types, wilayas, communes or shipping rates — re-running
 * it cannot disturb the catalogue. It only creates orders and the demo user.
 *
 * Idempotent: every demo order belongs to one of DEMO_PHONES, and a re-run
 * removes those and rebuilds them. Real orders are never matched.
 *
 * Uses the app's own Prisma client rather than constructing one: the image
 * service imported below already pulls it in, and two clients would mean two
 * Neon connection pools — the one this script did not create would keep the
 * process alive after $disconnect().
 */

// The demo's whole identity. Invented numbers, valid Algerian format, and the
// only thing this script will ever delete.
const DEMO_PHONES = [
  '0551204487', // Yasmine Belkacem   — repeat buyer, clean history
  '0661839025', // Karim Benali       — repeat buyer, two returns
  '0770143398',
  '0555907712',
  '0698224510',
  '0771560834',
  '0559338176',
  '0663471029',
] as const

const REPEAT_CLEAN = DEMO_PHONES[0]
const REPEAT_RISKY = DEMO_PHONES[1]

const DEMO_ADMIN = {
  email: 'demo@casbah.dz',
  password: 'demo1234',
  name: 'Compte démo',
}

type Spec = {
  name: string
  phone: string
  status: OrderStatus
  /** Whole days before today. Nothing is stamped "now" — a demo of one moment. */
  daysAgo: number
  wilayaCode: number
  deliveryType: 'DESK' | 'HOME'
  /** How many distinct variants, and how many of each. */
  items: Array<{ nth: number; quantity: number }>
  notes?: string
}

/**
 * 20 orders. The two RETURNED both belong to REPEAT_RISKY on purpose: the admin
 * only shows its rust warning chip at returnedCount >= 2, so splitting them
 * across two customers would demo the neutral note and never the alarm.
 */
const ORDERS: Spec[] = [
  // --- PENDING (5) — awaiting the confirmation call
  { name: 'Yasmine Belkacem', phone: REPEAT_CLEAN, status: 'PENDING', daysAgo: 0, wilayaCode: 16, deliveryType: 'HOME', items: [{ nth: 3, quantity: 1 }] },
  { name: 'Nadia Cherif', phone: DEMO_PHONES[2], status: 'PENDING', daysAgo: 0, wilayaCode: 31, deliveryType: 'DESK', items: [{ nth: 7, quantity: 2 }] },
  { name: 'Sofiane Hamdani', phone: DEMO_PHONES[3], status: 'PENDING', daysAgo: 1, wilayaCode: 25, deliveryType: 'DESK', items: [{ nth: 1, quantity: 1 }, { nth: 11, quantity: 1 }] },
  { name: 'Amina Ould Ali', phone: DEMO_PHONES[4], status: 'PENDING', daysAgo: 1, wilayaCode: 6, deliveryType: 'HOME', items: [{ nth: 5, quantity: 1 }], notes: 'Appeler après 17h.' },
  { name: 'Riad Meziane', phone: DEMO_PHONES[5], status: 'PENDING', daysAgo: 2, wilayaCode: 9, deliveryType: 'DESK', items: [{ nth: 9, quantity: 1 }] },

  // --- CONFIRMED (4) — called, awaiting despatch
  { name: 'Karim Benali', phone: REPEAT_RISKY, status: 'CONFIRMED', daysAgo: 2, wilayaCode: 16, deliveryType: 'DESK', items: [{ nth: 2, quantity: 1 }] },
  { name: 'Lila Boudjemaa', phone: DEMO_PHONES[6], status: 'CONFIRMED', daysAgo: 3, wilayaCode: 19, deliveryType: 'HOME', items: [{ nth: 4, quantity: 1 }, { nth: 8, quantity: 1 }] },
  { name: 'Mehdi Zeroual', phone: DEMO_PHONES[7], status: 'CONFIRMED', daysAgo: 4, wilayaCode: 23, deliveryType: 'DESK', items: [{ nth: 12, quantity: 2 }] },
  { name: 'Yasmine Belkacem', phone: REPEAT_CLEAN, status: 'CONFIRMED', daysAgo: 5, wilayaCode: 16, deliveryType: 'HOME', items: [{ nth: 6, quantity: 1 }] },

  // --- SHIPPED (3) — with the courier
  { name: 'Nadia Cherif', phone: DEMO_PHONES[2], status: 'SHIPPED', daysAgo: 6, wilayaCode: 31, deliveryType: 'DESK', items: [{ nth: 10, quantity: 1 }] },
  { name: 'Sofiane Hamdani', phone: DEMO_PHONES[3], status: 'SHIPPED', daysAgo: 7, wilayaCode: 25, deliveryType: 'HOME', items: [{ nth: 3, quantity: 2 }] },
  { name: 'Riad Meziane', phone: DEMO_PHONES[5], status: 'SHIPPED', daysAgo: 8, wilayaCode: 9, deliveryType: 'DESK', items: [{ nth: 1, quantity: 1 }] },

  // --- DELIVERED (5) — paid, cash collected
  { name: 'Yasmine Belkacem', phone: REPEAT_CLEAN, status: 'DELIVERED', daysAgo: 10, wilayaCode: 16, deliveryType: 'HOME', items: [{ nth: 11, quantity: 1 }] },
  { name: 'Amina Ould Ali', phone: DEMO_PHONES[4], status: 'DELIVERED', daysAgo: 12, wilayaCode: 6, deliveryType: 'DESK', items: [{ nth: 2, quantity: 1 }, { nth: 7, quantity: 1 }] },
  { name: 'Lila Boudjemaa', phone: DEMO_PHONES[6], status: 'DELIVERED', daysAgo: 14, wilayaCode: 19, deliveryType: 'HOME', items: [{ nth: 5, quantity: 3 }] },
  { name: 'Mehdi Zeroual', phone: DEMO_PHONES[7], status: 'DELIVERED', daysAgo: 16, wilayaCode: 23, deliveryType: 'DESK', items: [{ nth: 9, quantity: 1 }] },
  { name: 'Nadia Cherif', phone: DEMO_PHONES[2], status: 'DELIVERED', daysAgo: 18, wilayaCode: 31, deliveryType: 'DESK', items: [{ nth: 4, quantity: 1 }] },

  // --- RETURNED (2) — both this customer, so the rust risk chip appears
  { name: 'Karim Benali', phone: REPEAT_RISKY, status: 'RETURNED', daysAgo: 13, wilayaCode: 16, deliveryType: 'HOME', items: [{ nth: 8, quantity: 1 }], notes: 'Colis refusé à la livraison.' },
  { name: 'Karim Benali', phone: REPEAT_RISKY, status: 'RETURNED', daysAgo: 20, wilayaCode: 16, deliveryType: 'HOME', items: [{ nth: 12, quantity: 1 }], notes: 'Taille ne convenait pas.' },

  // --- CANCELLED (1)
  { name: 'Riad Meziane', phone: DEMO_PHONES[5], status: 'CANCELLED', daysAgo: 21, wilayaCode: 9, deliveryType: 'DESK', items: [{ nth: 6, quantity: 1 }], notes: 'Client injoignable après 3 appels.' },
]

/** CANCELLED and RETURNED mean the stock went back, so they hold none. */
const HOLDS_STOCK = (s: OrderStatus) => s !== 'CANCELLED' && s !== 'RETURNED'

function at(daysAgo: number, hour: number, minute: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, minute, 0, 0)
  return d
}

// ---------------------------------------------------------------- 1. wipe

async function removeExistingDemoOrders(): Promise<void> {
  const doomed = await prisma.order.findMany({
    where: { phone: { in: [...DEMO_PHONES] } },
    select: {
      id: true,
      phone: true,
      orderNumber: true,
      status: true,
      stockRestored: true,
      items: { select: { variantId: true, quantity: true } },
    },
  })

  if (doomed.length === 0) {
    console.log('  wipe:       no existing demo orders')
    return
  }

  // The guard. It is an invariant check on the delete set immediately before
  // the destructive call, so if the query above is ever widened — a changed
  // filter, an added OR, a copy-paste — this aborts instead of deleting real
  // orders. Cheap, and the one thing standing between a bug and lost history.
  const strays = doomed.filter((o) => !DEMO_PHONES.includes(o.phone as (typeof DEMO_PHONES)[number]))
  if (strays.length > 0) {
    throw new Error(
      `REFUSING TO DELETE: ${strays.length} order(s) outside DEMO_PHONES matched ` +
        `(${strays.map((o) => `${o.orderNumber}/${o.phone}`).join(', ')}). ` +
        'Nothing has been deleted. Fix the selection before re-running.',
    )
  }

  const total = await prisma.order.count()
  console.log(`  wipe:       ${doomed.length} demo order(s) of ${total} total; ${total - doomed.length} real order(s) untouched`)

  await prisma.$transaction(async (tx) => {
    // Give back what the deleted orders were still holding. An order already
    // CANCELLED/RETURNED gave its stock back when it reached that status, so
    // returning it again here would inflate the shelf.
    for (const o of doomed) {
      if (!HOLDS_STOCK(o.status) || o.stockRestored) continue
      for (const it of o.items) {
        if (it.variantId === null) continue
        await tx.variant.update({
          where: { id: it.variantId },
          data: { stock: { increment: it.quantity } },
        })
      }
    }
    // By explicit id, not by the phone filter again: the set that was inspected
    // is exactly the set that is deleted. Items cascade.
    await tx.order.deleteMany({ where: { id: { in: doomed.map((o) => o.id) } } })
  })
}

// ---------------------------------------------------------------- 2. build

async function createDemoOrders(): Promise<void> {
  const wilayas = await prisma.wilaya.findMany({
    where: { code: { in: [...new Set(ORDERS.map((o) => o.wilayaCode))] } },
    select: {
      id: true,
      code: true,
      communes: { select: { id: true }, orderBy: { id: 'asc' }, take: 1 },
      shippingRates: { where: { isDefault: true }, take: 1, select: { deskPrice: true, homePrice: true } },
    },
  })
  const byCode = new Map(wilayas.map((w) => [w.code, w]))

  // Variants with room to spare, so the demo cannot push anything negative and
  // the low-stock panel still shows the genuinely low items from the catalogue.
  const pool = await prisma.variant.findMany({
    where: { stock: { gte: 6 }, product: { active: true } },
    select: {
      id: true,
      size: true,
      color: true,
      sku: true,
      priceOverride: true,
      product: { select: { id: true, name: true, basePrice: true, images: true } },
    },
    orderBy: { id: 'asc' },
  })
  if (pool.length < 12) throw new Error(`only ${pool.length} well-stocked variants — run the main seed first`)

  // Same resolver the storefront and the order service use, so the demo's
  // thumbnails follow the identical colour -> shared -> legacy fallback chain.
  const galleries = await galleriesForProducts([...new Set(pool.map((v) => v.product.id))])

  // Continue the real sequence so screenshots show plausible numbers.
  const year = new Date().getFullYear()
  const prefix = `CMD-${year}-`
  const last = await prisma.order.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { id: 'desc' },
    select: { orderNumber: true },
  })
  let seq = last ? Number(last.orderNumber.slice(prefix.length)) + 1 : 1

  let created = 0
  for (const spec of ORDERS) {
    const w = byCode.get(spec.wilayaCode)
    if (!w) throw new Error(`wilaya ${spec.wilayaCode} missing — run the main seed first`)
    const communeId = w.communes[0]?.id
    const rate = w.shippingRates[0]
    if (communeId === undefined || !rate) throw new Error(`wilaya ${spec.wilayaCode} has no commune or default rate`)

    const shipping = spec.deliveryType === 'DESK' ? rate.deskPrice : rate.homePrice

    const lines = spec.items.map(({ nth, quantity }) => {
      const v = pool[nth % pool.length]!
      const unitPrice = v.priceOverride ?? v.product.basePrice
      return {
        variantId: v.id,
        quantity,
        unitPrice,
        productName: v.product.name,
        variantSize: v.size,
        variantColor: v.color,
        sku: v.sku,
        imageUrl:
          resolveGallery(galleries.get(v.product.id) ?? [], v.product.images, v.color)[0] ?? null,
      }
    })

    // Real arithmetic from real catalogue prices, so the admin's totals add up.
    const subtotal = lines.reduce((n, l) => n + l.unitPrice * l.quantity, 0)
    const createdAt = at(spec.daysAgo, 9 + (created % 9), (created * 7) % 60)
    // A delivered order was last touched when it was delivered, not now.
    const updatedAt = spec.status === 'PENDING' ? createdAt : at(Math.max(0, spec.daysAgo - 1), 14, 30)

    await prisma.$transaction(async (tx) => {
      await tx.order.create({
        data: {
          orderNumber: `${prefix}${String(seq++).padStart(4, '0')}`,
          customerName: spec.name,
          phone: spec.phone,
          wilayaId: w.id,
          communeId,
          address: null,
          deliveryType: spec.deliveryType,
          subtotal,
          shipping,
          total: subtotal + shipping,
          status: spec.status,
          notes: spec.notes ?? null,
          createdAt,
          updatedAt,
          // The latch means "stock has been given back". Terminal states are
          // written as already-restored, which is why they decrement nothing.
          stockRestored: !HOLDS_STOCK(spec.status),
          items: { create: lines },
        },
      })

      if (HOLDS_STOCK(spec.status)) {
        for (const l of lines) {
          await tx.variant.update({
            where: { id: l.variantId },
            data: { stock: { decrement: l.quantity } },
          })
        }
      }
    })
    created += 1
  }

  console.log(`  orders:     ${created} created`)
}

// ---------------------------------------------------------------- 3. user

async function seedDemoAdmin(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_ADMIN.password, 10)
  await prisma.user.upsert({
    where: { email: DEMO_ADMIN.email },
    // Unlike the real admin, the password IS reset on every run: these
    // credentials are printed in the storefront footer, so the account must
    // always match what the footer promises.
    update: { name: DEMO_ADMIN.name, passwordHash, readOnly: true },
    create: { email: DEMO_ADMIN.email, name: DEMO_ADMIN.name, passwordHash, readOnly: true },
  })
  console.log(`  demo user:  ${DEMO_ADMIN.email} / ${DEMO_ADMIN.password}  (read-only)`)
}

// ---------------------------------------------------------------- run

/**
 * Both columns this script writes arrive by migration, and the one it needs
 * last (User.readOnly) would otherwise fail AFTER twenty orders had been
 * created, leaving demo data with no demo login. Checked up front so the script
 * either does all of its work or none of it.
 */
async function preflight(): Promise<void> {
  const cols = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE (table_name = 'User' AND column_name = 'readOnly')
       OR (table_name = 'OrderItem' AND column_name = 'imageUrl')
  `
  const have = new Set(cols.map((c) => `${c.table_name}.${c.column_name}`))
  const missing = ['User.readOnly', 'OrderItem.imageUrl'].filter((c) => !have.has(c))
  if (missing.length > 0) {
    throw new Error(
      `missing column(s): ${missing.join(', ')}. Nothing has been written.` +
        '\n    Run: npx prisma migrate dev' +
        '\n    (migrate status will NOT report this: it compares the migrations' +
        '\n     folder to what is recorded as applied, not schema to database.)',
    )
  }
}

async function main(): Promise<void> {
  console.log('\nDemo data — orders and the read-only demo login only.')
  console.log('The catalogue is never touched by this script.\n')

  await preflight()
  await removeExistingDemoOrders()
  await createDemoOrders()
  await seedDemoAdmin()

  const counts = await prisma.order.groupBy({ by: ['status'], _count: { _all: true } })
  console.log('\n  orders now by status:')
  for (const c of counts) console.log(`    ${String(c.status).padEnd(10)} ${c._count._all}`)

  const risky = await prisma.order.count({ where: { phone: REPEAT_RISKY, status: 'RETURNED' } })
  const clean = await prisma.order.count({ where: { phone: REPEAT_CLEAN } })
  console.log(`\n  risk chip:  ${REPEAT_RISKY} has ${risky} returns (rust warning needs >= 2)`)
  console.log(`  repeat:     ${REPEAT_CLEAN} has ${clean} orders, 0 returns (green chip needs >= 3)`)
}

main()
  .catch((e: unknown) => {
    console.error('\nDemo seed failed:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
