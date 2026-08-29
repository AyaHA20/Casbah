/**
 * Casbah — database seed.
 *
 * Idempotent: every write is an upsert keyed on a unique column, so running
 * this repeatedly converges on the same state instead of duplicating rows.
 *   Wilaya       -> code                Category -> slug
 *   Commune      -> (wilayaId, name)    Product  -> slug
 *   ShippingRate -> (wilayaId, carrier) Variant  -> sku
 *   User         -> email
 *
 * Geography comes from prisma/data/*.json (69 wilayas, 1541 communes) rather
 * than from hand-typed tables.
 *
 * Run with:  npm run seed
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import bcrypt from 'bcrypt'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is not set — check server/.env')
}

// Prisma 7 requires an explicit driver adapter.
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

const SIZES = ['S', 'M', 'L', 'XL'] as const

// ---------------------------------------------------------------------------
// Reference geography is loaded from prisma/data/, not hand-typed:
//   main.json     -> 69 wilayas, codes 1-69, each carrying a `region`
//   communes.json -> 1541 communes, each carrying a `wilaya_id`
// ---------------------------------------------------------------------------
type Region = 'North' | 'High Plateaus' | 'Sahara'
type RawWilaya = { id: number; name: string; name_ar: string; region: Region }
type RawCommune = { wilaya_id: number; name: string; name_ar: string }

function loadJson<T>(file: string): T {
  return JSON.parse(
    readFileSync(new URL(`./data/${file}`, import.meta.url), 'utf8'),
  ) as T
}

const RAW_WILAYAS = loadJson<{ wilayas: RawWilaya[] }>('main.json').wilayas
const RAW_COMMUNES = loadJson<{ communes: RawCommune[] }>('communes.json').communes

// The dataset spells wilaya 16 in English. Add more here if you spot others.
const NAME_FR_OVERRIDES: Record<number, string> = {
  16: 'Alger',
}

// ---------------------------------------------------------------------------
// PLACEHOLDER shipping rates.
//
// These are NOT Yalidine rates, NOT ZR Express rates, and must never be shown
// or described as either. They exist only so checkout has something to read
// before a real price list is loaded. That is also why every seeded row uses
// carrier OTHER: the data itself refuses to claim a named courier quoted this.
//
// To use real prices, import the courier's own list as YALIDINE / ZR_EXPRESS
// rows and move isDefault onto the one the shop actually ships with.
// ---------------------------------------------------------------------------
const BANDS: Record<Region, [number, number]> = {
  North: [450, 650],
  'High Plateaus': [650, 800],
  Sahara: [800, 1000],
}

// The three you pinned explicitly. Everything else is derived.
const PINNED_RATES: Record<number, [number, number]> = {
  16: [450, 600], // Alger
  19: [650, 900], // Setif
  31: [600, 850], // Oran
}

/** Deterministic, so re-seeding never shuffles prices around. */
function placeholderRate(code: number, region: Region): [number, number] {
  const pinned = PINNED_RATES[code]
  if (pinned) return pinned
  const [min, max] = BANDS[region]
  const desk = Math.min(min + Math.round(((code * 37) % (max - min + 1)) / 10) * 10, max)
  const home = desk + 150 + Math.round(((code * 23) % 101) / 10) * 10
  return [desk, home]
}

// What the garment IS, orthogonal to CATEGORIES (how it is merchandised).
// A robe is category=femme AND type=robe.
const PRODUCT_TYPES: Array<{ name: string; slug: string }> = [
  { name: 'Hoodie', slug: 'hoodie' },
  { name: 'Sweat', slug: 'sweat' },
  { name: 'T-shirt', slug: 't-shirt' },
  { name: 'Top', slug: 'top' },
  { name: 'Chemise', slug: 'chemise' },
  { name: 'Robe', slug: 'robe' },
  { name: 'Jupe', slug: 'jupe' },
  { name: 'Pantalon', slug: 'pantalon' },
  { name: 'Veste', slug: 'veste' },
  { name: 'Survêtement', slug: 'survetement' },
]

// Categories are seasonal / promotional sections of the shop, never gendered:
// who a garment is for lives on Product.gender and nowhere else. The shop adds
// its own (Soldes, Collection été, …) from the admin, so the seed ships only
// the one every shop starts with.
const CATEGORIES: Array<{ name: string; slug: string }> = [
  { name: 'Nouveautés', slug: 'nouveautes' },
]

// Products. `stock` is one number per size, in SIZES order: [S, M, L, XL].
// A few are deliberately 0 so the out-of-stock state is visible in the UI.
type ColorSpec = {
  name: string
  code: string
  stock: [number, number, number, number]
}
type ProductSpec = {
  name: string
  slug: string
  sku: string
  category: string
  type: string
  basePrice: number
  description: string
  colors: ColorSpec[]
}

const PRODUCTS: ProductSpec[] = [
  {
    name: 'Sweat capuche Casbah',
    slug: 'sweat-capuche-casbah',
    type: 'hoodie',
    sku: 'CSB',
    category: 'nouveautes',
    basePrice: 4900,
    description:
      "Sweat à capuche en molleton gratté, coupe droite et poche kangourou. Sérigraphie inspirée des ruelles en escalier de la Casbah d'Alger. Coton lourd 380 g/m², parfait pour les soirées fraîches.",
    colors: [
      { name: 'Noir', code: 'NR', stock: [12, 20, 18, 7] },
      { name: 'Gris chiné', code: 'GC', stock: [8, 0, 14, 5] },
      { name: 'Bordeaux', code: 'BX', stock: [4, 9, 0, 0] },
    ],
  },
  {
    name: 'T-shirt oversize Bab El Oued',
    slug: 't-shirt-oversize-bab-el-oued',
    type: 't-shirt',
    sku: 'BEO',
    category: 'nouveautes',
    basePrice: 2400,
    description:
      'T-shirt oversize en jersey de coton peigné, épaules tombantes et col côtelé renforcé. Un hommage graphique au quartier de Bab El Oued. Lavable en machine à 30°.',
    colors: [
      { name: 'Blanc', code: 'BL', stock: [25, 30, 22, 11] },
      { name: 'Noir', code: 'NR', stock: [18, 24, 19, 0] },
      { name: 'Sable', code: 'SB', stock: [6, 13, 9, 4] },
    ],
  },
  {
    name: 'Robe longue Zellige',
    slug: 'robe-longue-zellige',
    type: 'robe',
    sku: 'ZLG',
    category: 'nouveautes',
    basePrice: 5600,
    description:
      "Robe longue fluide à manches trois-quarts, imprimée d'un motif zellige revisité. Fendue sur le côté et doublée jusqu'aux genoux. Tombé souple en viscose.",
    colors: [
      { name: 'Bleu majorelle', code: 'BM', stock: [7, 12, 10, 3] },
      { name: 'Terracotta', code: 'TC', stock: [5, 8, 0, 2] },
    ],
  },
  {
    name: 'Pantalon cargo Alger Centre',
    slug: 'pantalon-cargo-alger-centre',
    type: 'pantalon',
    sku: 'ALC',
    category: 'nouveautes',
    basePrice: 4200,
    description:
      'Pantalon cargo en toile de coton résistante, six poches dont deux à rabat, taille ajustable par cordon. Coupe droite légèrement fuselée à la cheville.',
    colors: [
      { name: 'Kaki', code: 'KK', stock: [10, 16, 14, 6] },
      { name: 'Noir', code: 'NR', stock: [9, 15, 12, 5] },
      { name: 'Beige', code: 'BG', stock: [0, 0, 7, 3] },
    ],
  },
  {
    name: 'Veste en jean Sidi Fredj',
    slug: 'veste-en-jean-sidi-fredj',
    type: 'veste',
    sku: 'SDF',
    category: 'nouveautes',
    basePrice: 6800,
    description:
      "Veste en denim brut non délavé, boutons métal et double poche poitrine. Le denim se patine à l'usage et devient unique. Coupe classique, légèrement cintrée.",
    colors: [
      { name: 'Bleu brut', code: 'BB', stock: [6, 11, 9, 4] },
      { name: 'Noir délavé', code: 'ND', stock: [3, 7, 5, 0] },
    ],
  },
  {
    name: 'Chemise en lin Tipaza',
    slug: 'chemise-en-lin-tipaza',
    type: 'chemise',
    sku: 'TPZ',
    category: 'nouveautes',
    basePrice: 3900,
    description:
      "Chemise en lin lavé, col italien et coupe décontractée. Respirante et légère, pensée pour les étés du littoral. Le lin s'assouplit à chaque lavage.",
    colors: [
      { name: 'Écru', code: 'EC', stock: [14, 18, 15, 8] },
      { name: 'Bleu ciel', code: 'BC', stock: [9, 13, 11, 6] },
      { name: 'Vert olive', code: 'VO', stock: [0, 5, 4, 2] },
    ],
  },
  {
    name: 'Jupe midi Mosaïque',
    slug: 'jupe-midi-mosaique',
    type: 'jupe',
    sku: 'MSQ',
    category: 'nouveautes',
    basePrice: 3600,
    description:
      'Jupe midi taille haute à godets, imprimé mosaïque aux tons terracotta. Fermeture invisible sur le côté et doublure intégrale.',
    colors: [
      { name: 'Terracotta', code: 'TC', stock: [8, 14, 12, 5] },
      { name: 'Noir', code: 'NR', stock: [6, 10, 0, 3] },
    ],
  },
  {
    name: 'Sweat crewneck Tassili',
    slug: 'sweat-crewneck-tassili',
    type: 'sweat',
    sku: 'TSL',
    category: 'nouveautes',
    basePrice: 4500,
    description:
      'Sweat col rond en molleton bouclette, broderie discrète évoquant les fresques rupestres du Tassili. Bords-côtes élastiques aux poignets et à la taille.',
    colors: [
      { name: 'Ivoire', code: 'IV', stock: [11, 17, 13, 6] },
      { name: 'Anthracite', code: 'AN', stock: [7, 12, 10, 4] },
      { name: 'Rouille', code: 'RL', stock: [0, 0, 0, 0] },
    ],
  },
  {
    name: 'Blouson bomber Kasbah Nuit',
    slug: 'blouson-bomber-kasbah-nuit',
    type: 'veste',
    sku: 'KBN',
    category: 'nouveautes',
    basePrice: 7900,
    description:
      'Blouson bomber matelassé, doublure satinée et col côtelé. Fermeture zippée deux sens et poches latérales dissimulées. Une pièce de mi-saison qui se porte de jour comme de nuit.',
    colors: [
      { name: 'Noir', code: 'NR', stock: [5, 9, 8, 3] },
      { name: 'Vert olive', code: 'VO', stock: [2, 6, 4, 0] },
    ],
  },
  {
    name: 'Top côtelé Amazigh',
    slug: 'top-cotele-amazigh',
    type: 'top',
    sku: 'AMZ',
    category: 'nouveautes',
    basePrice: 2900,
    description:
      'Top court en maille côtelée stretch, bretelles fines et dos nu. Motif amazigh tissé sur la bordure. Se superpose facilement sous une chemise ouverte.',
    colors: [
      { name: 'Blanc', code: 'BL', stock: [16, 21, 17, 9] },
      { name: 'Noir', code: 'NR', stock: [13, 19, 15, 7] },
      { name: 'Camel', code: 'CM', stock: [4, 0, 6, 2] },
    ],
  },
  {
    name: 'Survêtement Djurdjura',
    slug: 'survetement-djurdjura',
    type: 'survetement',
    sku: 'DJR',
    category: 'nouveautes',
    basePrice: 6900,
    description:
      'Ensemble survêtement en molleton doux : veste zippée à capuche et pantalon à taille élastiquée. Coupe ample inspirée des sommets enneigés du Djurdjura.',
    colors: [
      { name: 'Gris chiné', code: 'GC', stock: [7, 13, 11, 5] },
      { name: 'Bleu marine', code: 'BM', stock: [6, 10, 9, 4] },
    ],
  },
  {
    name: 'Caftan moderne Andalou',
    slug: 'caftan-moderne-andalou',
    type: 'robe',
    sku: 'AND',
    category: 'nouveautes',
    basePrice: 8900,
    description:
      "Caftan revisité en crêpe de soie mélangée, broderie fil doré sur le plastron et manches évasées. Une réinterprétation contemporaine de l'héritage andalou, à porter ceinturé ou fluide.",
    colors: [
      { name: 'Émeraude', code: 'EM', stock: [4, 8, 6, 2] },
      { name: 'Ivoire', code: 'IV', stock: [3, 7, 5, 0] },
      { name: 'Bordeaux', code: 'BX', stock: [0, 4, 3, 1] },
    ],
  },
]

// ---------------------------------------------------------------------------

/** Neon suspends idle computes; the first connection can fail while it wakes. */
async function connectWithRetry(attempts = 5): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await prisma.$connect()
      return
    } catch (err) {
      const msg = String((err as Error)?.message ?? err)
      if (!/P1001|reach database/.test(msg) || i === attempts) throw err
      console.log(`  database asleep (attempt ${i}/${attempts}), retrying in 3s...`)
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}

/** Runs `limit` promises at a time — 1541 sequential round trips to Neon is minutes. */
async function inChunks<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < items.length; i += limit) {
    await Promise.all(items.slice(i, i + limit).map(fn))
  }
}

async function seedWilayas(): Promise<Map<number, number>> {
  const byCode = new Map<number, number>()
  for (const w of RAW_WILAYAS) {
    const nameFr = NAME_FR_OVERRIDES[w.id] ?? w.name
    const row = await prisma.wilaya.upsert({
      where: { code: w.id },
      update: { nameFr, nameAr: w.name_ar },
      create: { code: w.id, nameFr, nameAr: w.name_ar },
    })
    byCode.set(w.id, row.id)
  }
  console.log(`  wilayas:    ${byCode.size}`)
  return byCode
}

async function seedCommunes(wilayaIdByCode: Map<number, number>): Promise<void> {
  await inChunks(RAW_COMMUNES, 25, async (c) => {
    const wilayaId = wilayaIdByCode.get(c.wilaya_id)
    if (!wilayaId) {
      throw new Error(`commune "${c.name}" references unknown wilaya ${c.wilaya_id}`)
    }
    await prisma.commune.upsert({
      where: { wilayaId_name: { wilayaId, name: c.name } },
      // Not `update: {}`: the 1541 rows already exist, so an empty update would
      // leave every one of them without the Arabic name this seed now carries.
      update: { nameAr: c.name_ar },
      create: { wilayaId, name: c.name, nameAr: c.name_ar },
    })
  })
  console.log(`  communes:   ${RAW_COMMUNES.length}`)
}

/**
 * Deletes communes that are not in the dataset.
 *
 * Why this exists: the first version of this seed used a hand-typed commune
 * list whose spellings differed from the dataset ("Setif" vs "Sétif"). Those
 * rows never matched the new (wilayaId, name) upsert key, so they survived as
 * duplicates. Left alone they show up in the checkout dropdown as near-copies
 * of real communes.
 */
async function pruneStaleCommunes(wilayaIdByCode: Map<number, number>): Promise<void> {
  const codeByWilayaId = new Map(
    [...wilayaIdByCode].map(([code, id]) => [id, code] as const),
  )
  const official = new Set(RAW_COMMUNES.map((c) => `${c.wilaya_id}|${c.name}`))

  const rows = await prisma.commune.findMany({
    select: { id: true, wilayaId: true, name: true },
  })
  const stale = rows.filter((r) => {
    const code = codeByWilayaId.get(r.wilayaId)
    return code === undefined || !official.has(`${code}|${r.name}`)
  })

  if (stale.length === 0) {
    console.log('  pruned:     0 stale communes')
    return
  }

  // Order.commune is Restrict, so deleting a commune an order points at would
  // throw and abort the whole seed. Skip those and report them instead --
  // losing order history is never worth tidying a dropdown.
  const staleIds = stale.map((s) => s.id)
  const referenced = new Set(
    (
      await prisma.order.findMany({
        where: { communeId: { in: staleIds } },
        select: { communeId: true },
        distinct: ['communeId'],
      })
    ).map((o) => o.communeId),
  )

  const deletable = staleIds.filter((id) => !referenced.has(id))
  if (deletable.length > 0) {
    await prisma.commune.deleteMany({ where: { id: { in: deletable } } })
  }
  console.log(`  pruned:     ${deletable.length} stale communes`)
  if (referenced.size > 0) {
    console.warn(`  ! ${referenced.size} stale communes kept - referenced by existing orders`)
  }
}

async function seedShippingRates(wilayaIdByCode: Map<number, number>): Promise<void> {
  let n = 0
  for (const w of RAW_WILAYAS) {
    const wilayaId = wilayaIdByCode.get(w.id)
    if (!wilayaId) throw new Error(`no wilaya seeded for code ${w.id}`)
    const [deskPrice, homePrice] = placeholderRate(w.id, w.region)
    await prisma.shippingRate.upsert({
      where: { wilayaId_carrier: { wilayaId, carrier: 'OTHER' } },
      update: { deskPrice, homePrice, isDefault: true },
      create: { wilayaId, carrier: 'OTHER', deskPrice, homePrice, isDefault: true },
    })
    n++
  }
  console.log(`  rates:      ${n} (carrier OTHER, placeholder prices)`)
}

async function seedCategories(): Promise<Map<string, number>> {
  const bySlug = new Map<string, number>()
  for (const c of CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name },
      create: { name: c.name, slug: c.slug },
    })
    bySlug.set(c.slug, row.id)
  }
  console.log(`  categories: ${bySlug.size}`)
  return bySlug
}

async function seedProductTypes(): Promise<Map<string, number>> {
  const bySlug = new Map<string, number>()
  for (const t of PRODUCT_TYPES) {
    const row = await prisma.productType.upsert({
      where: { slug: t.slug },
      update: { name: t.name },
      create: { name: t.name, slug: t.slug },
    })
    bySlug.set(t.slug, row.id)
  }
  console.log(`  types:      ${bySlug.size}`)
  return bySlug
}

async function seedProducts(
  categoryIdBySlug: Map<string, number>,
  typeIdBySlug: Map<string, number>,
): Promise<void> {
  let variantCount = 0
  for (const p of PRODUCTS) {
    const categoryId = categoryIdBySlug.get(p.category)
    if (!categoryId) throw new Error(`unknown category "${p.category}" on ${p.slug}`)
    const typeId = typeIdBySlug.get(p.type)
    if (!typeId) throw new Error(`unknown type "${p.type}" on ${p.slug}`)

    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      // `images` is deliberately absent from `update`: re-seeding must not wipe
      // images added by hand since the last run. It is only set on create.
      update: {
        name: p.name,
        description: p.description,
        basePrice: p.basePrice,
        categoryId,
        typeId,
        active: true,
      },
      create: {
        name: p.name,
        slug: p.slug,
        description: p.description,
        basePrice: p.basePrice,
        categoryId,
        typeId,
        images: [],
        active: true,
      },
    })

    for (const color of p.colors) {
      for (let i = 0; i < SIZES.length; i++) {
        const size = SIZES[i]!
        const stock = color.stock[i]!
        const sku = `${p.sku}-${color.code}-${size}`
        await prisma.variant.upsert({
          where: { sku },
          // Stock IS reset on re-seed — a known starting state is the point.
          update: {
            productId: product.id,
            size,
            color: color.name,
            stock,
            priceOverride: null,
          },
          create: {
            productId: product.id,
            size,
            color: color.name,
            stock,
            sku,
            priceOverride: null,
          },
        })
        variantCount++
      }
    }
  }
  console.log(`  products:   ${PRODUCTS.length}`)
  console.log(`  variants:   ${variantCount}`)
}

async function seedAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL ?? 'admin@casbah.dz'
  const name = process.env.ADMIN_NAME ?? 'Administrateur'
  const password = process.env.ADMIN_PASSWORD ?? 'casbah-dev-2026'

  if (!process.env.ADMIN_PASSWORD) {
    console.warn(
      '  ! ADMIN_PASSWORD is not set - using the development default.\n' +
        '    Set ADMIN_PASSWORD in server/.env before this goes anywhere real.',
    )
  }

  const passwordHash = await bcrypt.hash(password, 10)

  await prisma.user.upsert({
    where: { email },
    // passwordHash is deliberately NOT in `update`: re-seeding must not silently
    // reset a password the admin has changed since the first run.
    update: { name },
    create: { email, passwordHash, name },
  })
  console.log(`  admin:      ${email}`)
}

async function main(): Promise<void> {
  console.log('Seeding Casbah...')
  await connectWithRetry()

  const wilayaIdByCode = await seedWilayas()
  await seedCommunes(wilayaIdByCode)
  await pruneStaleCommunes(wilayaIdByCode)
  await seedShippingRates(wilayaIdByCode)
  const categoryIdBySlug = await seedCategories()
  const typeIdBySlug = await seedProductTypes()
  await seedProducts(categoryIdBySlug, typeIdBySlug)
  await seedAdmin()

  console.log('Done.')
}

main()
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
