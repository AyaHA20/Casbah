import { prisma } from '../lib/prisma.js'
import { conflict, notFound } from '../lib/http-error.js'
import { pathFromPublicUrl, publicUrl, removeObject } from '../lib/storage.js'

/**
 * Photos grouped by colour.
 *
 * `color: null` is the shared set — what a colour with no photos of its own
 * falls back to. `Product.images` predates this table and is still honoured as
 * a last resort, so products photographed before per-colour galleries existed
 * keep rendering without a data migration.
 */
export type ColourGallery = {
  /** Null key means the shared set. */
  color: string | null
  images: Array<{ id: number; url: string; position: number }>
}

const imageSelect = { id: true, url: true, position: true, color: true } as const

/** Every gallery on a product, shared set first, then colours alphabetically. */
export async function listImages(productId: number): Promise<ColourGallery[]> {
  const rows = await prisma.productImage.findMany({
    where: { productId },
    orderBy: [{ color: 'asc' }, { position: 'asc' }, { id: 'asc' }],
    select: imageSelect,
  })

  const byColour = new Map<string | null, ColourGallery['images']>()
  for (const r of rows) {
    const key = r.color
    if (!byColour.has(key)) byColour.set(key, [])
    byColour.get(key)!.push({ id: r.id, url: r.url, position: r.position })
  }

  const shared = byColour.get(null) ?? []
  byColour.delete(null)

  return [
    { color: null, images: shared },
    ...[...byColour.entries()]
      .sort(([a], [b]) => String(a).localeCompare(String(b), 'fr'))
      .map(([color, images]) => ({ color, images })),
  ]
}

/**
 * Resolves the gallery a customer should see for a colour.
 *
 * Fallback chain, in order: that colour's own photos -> the shared set ->
 * the legacy Product.images -> empty (the caller draws the arch placeholder).
 * Never returns an empty gallery when any photo exists anywhere on the product.
 */
export function resolveGallery(
  galleries: ColourGallery[],
  legacyImages: string[],
  color: string | null,
): string[] {
  const own = color === null ? [] : (galleries.find((g) => g.color === color)?.images ?? [])
  if (own.length > 0) return own.map((i) => i.url)

  const shared = galleries.find((g) => g.color === null)?.images ?? []
  if (shared.length > 0) return shared.map((i) => i.url)

  return legacyImages
}

/**
 * Galleries for many products at once.
 *
 * List endpoints render one thumbnail per product, so fetching galleries per
 * row would be an N+1 that grows with page size. One query, grouped in memory.
 */
export async function galleriesForProducts(
  productIds: number[],
): Promise<Map<number, ColourGallery[]>> {
  const out = new Map<number, ColourGallery[]>()
  if (productIds.length === 0) return out

  const rows = await prisma.productImage.findMany({
    where: { productId: { in: productIds } },
    orderBy: [{ color: 'asc' }, { position: 'asc' }, { id: 'asc' }],
    select: { ...imageSelect, productId: true },
  })

  for (const r of rows) {
    const list = out.get(r.productId) ?? []
    let g = list.find((x) => x.color === r.color)
    if (!g) {
      g = { color: r.color, images: [] }
      // Shared set first, mirroring listImages, so "first colour" is stable.
      if (r.color === null) list.unshift(g)
      else list.push(g)
    }
    g.images.push({ id: r.id, url: r.url, position: r.position })
    out.set(r.productId, list)
  }
  return out
}

/**
 * The single photo a product CARD should show, with no colour selected.
 *
 * Shared set, then the first colour's set, then the legacy flat list. Same
 * chain as the detail page, minus the "selected colour" step that a card has
 * no notion of.
 */
export function cardImages(galleries: ColourGallery[] | undefined, legacy: string[]): string[] {
  const g = galleries ?? []
  const shared = g.find((x) => x.color === null)?.images ?? []
  if (shared.length > 0) return shared.map((i) => i.url)

  const firstColour = g.find((x) => x.color !== null && x.images.length > 0)
  if (firstColour) return firstColour.images.map((i) => i.url)

  return legacy
}

/** Total photos on a product, across every colour plus the legacy list. */
export function photoCount(galleries: ColourGallery[] | undefined, legacy: string[]): number {
  const fromTable = (galleries ?? []).reduce((n, g) => n + g.images.length, 0)
  return fromTable > 0 ? fromTable : legacy.length
}

export async function addImage(productId: number, path: string, color: string | null) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, variants: { select: { color: true } } },
  })
  if (!product) throw notFound(`Produit introuvable : ${productId}`)

  // A photo filed under a colour the product does not come in would be
  // unreachable — the storefront only ever asks for colours that have variants.
  if (color !== null) {
    const colours = new Set(product.variants.map((v) => v.color))
    if (!colours.has(color)) {
      throw conflict(
        'UNKNOWN_COLOUR',
        `« ${color} » n'est pas une couleur de ce produit.`,
        { colours: [...colours] },
      )
    }
  }

  const url = publicUrl(path)
  const existing = await prisma.productImage.findFirst({
    where: { productId, color, url },
    select: { id: true },
  })
  if (existing) return listImages(productId)

  const last = await prisma.productImage.findFirst({
    where: { productId, color },
    orderBy: { position: 'desc' },
    select: { position: true },
  })

  await prisma.productImage.create({
    data: { productId, color, url, position: (last?.position ?? -1) + 1 },
  })
  return listImages(productId)
}

export async function removeImage(productId: number, imageId: number) {
  const image = await prisma.productImage.findFirst({
    where: { id: imageId, productId },
    select: { id: true, url: true },
  })
  if (!image) throw notFound(`Photo introuvable : ${imageId}`)

  await prisma.productImage.delete({ where: { id: image.id } })

  // Drop the object too, unless the same URL is still referenced elsewhere —
  // the shared set and a colour set can legitimately point at one file.
  const stillUsed = await prisma.productImage.count({ where: { url: image.url } })
  if (stillUsed === 0) {
    const path = pathFromPublicUrl(image.url)
    if (path) await removeObject(path).catch(() => undefined)
  }

  return listImages(productId)
}

/**
 * Keeps photos attached when a colour is renamed.
 *
 * `ProductImage.color` is a plain string rather than a foreign key, so nothing
 * in the database enforces this — without it, renaming "Gris" to "Gris chiné"
 * would silently orphan that colour's gallery.
 */
export async function renameColour(productId: number, from: string, to: string) {
  return prisma.productImage.updateMany({
    where: { productId, color: from },
    data: { color: to },
  })
}
