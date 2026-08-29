import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { publicUrl } from '../lib/storage.js'
import { cardImages, galleriesForProducts } from './product-images.service.js'

/**
 * Owner-editable storefront settings.
 *
 * Stored key/value so the shop can gain a setting without a migration. The
 * shape is still enforced here: every read is parsed, and anything missing or
 * malformed falls back to the built-in default rather than rendering blank.
 * An empty string counts as "not set" — clearing a field in the admin must mean
 * the same thing as never filling it.
 */
/**
 * The field shapes, with no defaults attached.
 *
 * Defaults belong on reads only — see StorefrontSettings below. They must not
 * reach the update body, and `.partial()` is not enough to keep them out:
 * Zod 4 applies a `.default()` even through `.optional()`, so
 * `StorefrontSettings.partial().parse({ heroImage: 'x' })` returns all nine
 * keys with the other eight as `''`. updateSettings writes every key it is
 * handed, so that body silently blanked the whole hero — which is exactly
 * what the admin's image upload sends.
 */
const settingsShape = {
  heroImage: z.string(),
  heroHeadingFr: z.string(),
  heroHeadingAr: z.string(),
  heroBodyFr: z.string(),
  heroBodyAr: z.string(),
  heroCtaFr: z.string(),
  heroCtaAr: z.string(),
  qrUrl: z.string(),
  /** Ordered: the owner controls the sequence, not just the membership. */
  featuredProductIds: z.array(z.number().int().positive()),
}

export const StorefrontSettings = z.object({
  heroImage: settingsShape.heroImage.default(''),
  heroHeadingFr: settingsShape.heroHeadingFr.default(''),
  heroHeadingAr: settingsShape.heroHeadingAr.default(''),
  heroBodyFr: settingsShape.heroBodyFr.default(''),
  heroBodyAr: settingsShape.heroBodyAr.default(''),
  heroCtaFr: settingsShape.heroCtaFr.default(''),
  heroCtaAr: settingsShape.heroCtaAr.default(''),
  qrUrl: settingsShape.qrUrl.default(''),
  featuredProductIds: settingsShape.featuredProductIds.default([]),
})
export type StorefrontSettings = z.infer<typeof StorefrontSettings>

// Undefaulted, so a key the caller omitted stays `undefined` and is skipped by
// the `v !== undefined` filter in updateSettings instead of being written blank.
export const SettingsUpdateBody = z.object(settingsShape).partial()
export type SettingsUpdateBody = z.infer<typeof SettingsUpdateBody>

const KEYS: Record<keyof StorefrontSettings, string> = {
  heroImage: 'hero.image',
  heroHeadingFr: 'hero.headingFr',
  heroHeadingAr: 'hero.headingAr',
  heroBodyFr: 'hero.bodyFr',
  heroBodyAr: 'hero.bodyAr',
  heroCtaFr: 'hero.ctaFr',
  heroCtaAr: 'hero.ctaAr',
  qrUrl: 'qr.url',
  featuredProductIds: 'featured.productIds',
}

const EMPTY: StorefrontSettings = StorefrontSettings.parse({})

export async function getSettings(): Promise<StorefrontSettings> {
  // Settings are decorative: every field has a built-in default. A read failure
  // — a missing table before the migration runs, a dropped connection — must
  // degrade to those defaults rather than 500 a customer-facing page.
  let rows: Array<{ key: string; value: string }>
  try {
    rows = await prisma.setting.findMany({
      where: { key: { in: Object.values(KEYS) } },
      select: { key: true, value: true },
    })
  } catch (err) {
    console.error('settings: read failed, serving defaults —', err instanceof Error ? err.message : err)
    return EMPTY
  }
  const byKey = new Map(rows.map((r) => [r.key, r.value]))

  const raw: Record<string, unknown> = {}
  for (const [field, key] of Object.entries(KEYS)) {
    const value = byKey.get(key)
    if (value === undefined || value === '') continue
    if (field === 'featuredProductIds') {
      try {
        const parsed: unknown = JSON.parse(value)
        if (Array.isArray(parsed)) raw[field] = parsed
      } catch {
        // A corrupted row must not take the storefront down.
      }
    } else {
      raw[field] = value
    }
  }

  const parsed = StorefrontSettings.safeParse(raw)
  return parsed.success ? parsed.data : EMPTY
}

export async function updateSettings(body: SettingsUpdateBody): Promise<StorefrontSettings> {
  // The client uploads to a bucket path and sends that path back; it has no way
  // to know the storage base URL. Resolve it here so what is stored is directly
  // renderable, and an already-absolute URL passes through untouched.
  if (typeof body.heroImage === 'string' && body.heroImage && !/^https?:/i.test(body.heroImage)) {
    body = { ...body, heroImage: publicUrl(body.heroImage) }
  }

  const writes = Object.entries(body).filter(([, v]) => v !== undefined)

  // One transaction: a half-saved hero (new image, old text) is worse than none.
  await prisma.$transaction(
    writes.map(([field, value]) => {
      const key = KEYS[field as keyof StorefrontSettings]
      const encoded = Array.isArray(value) ? JSON.stringify(value) : String(value)
      return prisma.setting.upsert({
        where: { key },
        update: { value: encoded },
        create: { key, value: encoded },
      })
    }),
  )

  return getSettings()
}

/**
 * The public storefront payload: settings plus the featured products resolved
 * in the owner's chosen order.
 */
export async function getStorefront() {
  const settings = await getSettings()

  const ids = settings.featuredProductIds
  if (ids.length === 0) return { ...settings, featured: [] }

  const products = await prisma.product.findMany({
    where: { id: { in: ids }, active: true },
    select: {
      id: true,
      name: true,
      slug: true,
      basePrice: true,
      images: true,
      // Featured rows must carry the same fields as any other product card, or
      // the Vitrine strip quietly diverges from the grid — the exact shape of
      // the photo bug, where only this endpoint was left behind.
      gender: true,
      nameAr: true,
      category: { select: { name: true, nameAr: true, slug: true } },
      type: { select: { name: true, nameAr: true, slug: true } },
      variants: { select: { stock: true } },
    },
  })

  // findMany ignores the order of `in`, and the owner's sequence is the point.
  // A product retired since it was featured simply drops out.
  const galleries = await galleriesForProducts(products.map((p) => p.id))

  const byId = new Map(products.map((p) => [p.id, p]))
  const featured = ids
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined)
    .map(({ variants, ...p }) => ({
      ...p,
      images: cardImages(galleries.get(p.id), p.images),
      inStock: variants.some((v) => v.stock > 0),
    }))

  return { ...settings, featured }
}
