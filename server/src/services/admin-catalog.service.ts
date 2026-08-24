import { prisma } from '../lib/prisma.js'
import type { Prisma } from '../../generated/prisma/client.js'
import { badRequest, conflict, notFound } from '../lib/http-error.js'
import { pathFromPublicUrl, publicUrl, removeObject } from '../lib/storage.js'
import type {
  ProductCreateBody,
  ProductListQueryAdmin,
  ProductUpdateBody,
  VariantCreateBody,
  VariantUpdateBody,
} from '../schemas/admin-catalog.schema.js'

export const LOW_STOCK_THRESHOLD = 5

/** "Sweat capuché Casbah" -> "sweat-capuche-casbah" */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
}

const productSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  basePrice: true,
  categoryId: true,
  typeId: true,
  images: true,
  active: true,
  createdAt: true,
  supplier: true,
  arrivalDate: true,
  category: { select: { id: true, name: true, slug: true } },
  type: { select: { id: true, name: true, slug: true } },
  variants: {
    orderBy: [{ color: 'asc' }, { size: 'asc' }],
    select: {
      id: true,
      size: true,
      color: true,
      sku: true,
      stock: true,
      priceOverride: true,
    },
  },
} satisfies Prisma.ProductSelect

// Retired products sink to the bottom of every ordering except an explicit
// name sort. `nulls: 'last'` keeps products with no arrival date out of the way
// rather than letting them head the list.
const ORDER_BY: Record<
  ProductListQueryAdmin['sort'],
  Prisma.ProductOrderByWithRelationInput[]
> = {
  recent: [{ active: 'desc' }, { createdAt: 'desc' }],
  arrival: [{ active: 'desc' }, { arrivalDate: { sort: 'desc', nulls: 'last' } }],
  name: [{ name: 'asc' }],
}

/**
 * "2026-08-19" -> that day at UTC midnight.
 *
 * Using `new Date('2026-08-19')` alone is already UTC, but building it
 * explicitly documents the intent: this is a calendar day the owner typed, not
 * an instant. Without pinning it, a browser in Algiers (UTC+1) round-tripping
 * through a server in Ohio can shift the date by one day.
 */
function toUtcDate(input: string): Date {
  return new Date(`${input}T00:00:00.000Z`)
}

export async function listProductsAdmin(query: ProductListQueryAdmin) {
  const where = {
    // Unlike the storefront, admin defaults to showing everything — a retired
    // product you cannot see is a product you cannot un-retire.
    ...(query.active === undefined ? {} : { active: query.active }),
    ...(query.category ? { category: { slug: query.category } } : {}),
    ...(query.q
      ? {
          // One search box covers product AND supplier: the owner types "Blida"
          // to find a row, not to declare which column it lives in.
          OR: [
            { name: { contains: query.q, mode: 'insensitive' as const } },
            { slug: { contains: query.q, mode: 'insensitive' as const } },
            { supplier: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  // Fetch one row beyond the page. If the whole result set fits on page 1 the
  // COUNT is redundant — we already know the total — which is the common case
  // for a catalogue of this size. Each saved statement is a full round trip
  // (~170ms from here to us-east-2), so this is the cheapest win available.
  const rows = await prisma.product.findMany({
    where,
    orderBy: ORDER_BY[query.sort],
    skip: (query.page - 1) * query.limit,
    take: query.limit + 1,
    select: productSelect,
  })

  const hasMore = rows.length > query.limit
  const data = rows.slice(0, query.limit)

  const total =
    !hasMore && query.page === 1
      ? data.length
      : await prisma.product.count({ where })

  return {
    data: data.map(withStockTotals),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  }
}

function withStockTotals<T extends { variants: Array<{ stock: number }> }>(product: T) {
  const totalStock = product.variants.reduce((n, v) => n + v.stock, 0)
  return {
    ...product,
    totalStock,
    lowStock: product.variants.some((v) => v.stock <= LOW_STOCK_THRESHOLD),
  }
}

export async function getProductAdmin(id: number) {
  const product = await prisma.product.findUnique({ where: { id }, select: productSelect })
  if (!product) throw notFound(`Produit introuvable : ${id}`)
  return withStockTotals(product)
}

export async function createProduct(body: ProductCreateBody) {
  const slug = body.slug ?? slugify(body.name)
  if (!slug) throw badRequest('BAD_SLUG', 'Impossible de générer un slug depuis ce nom.')

  const clash = await prisma.product.findUnique({ where: { slug }, select: { id: true } })
  if (clash) throw conflict('SLUG_TAKEN', `Le slug « ${slug} » est déjà utilisé.`)

  if (body.categoryId != null) await assertCategory(body.categoryId)

  const product = await prisma.product.create({
    data: {
      name: body.name,
      slug,
      description: body.description,
      basePrice: body.basePrice,
      categoryId: body.categoryId ?? null,
      typeId: body.typeId ?? null,
      images: [],
      active: true,
      supplier: body.supplier ?? null,
      arrivalDate: body.arrivalDate ? toUtcDate(body.arrivalDate) : null,
    },
    select: productSelect,
  })
  return withStockTotals(product)
}

export async function updateProduct(id: number, body: ProductUpdateBody) {
  const existing = await prisma.product.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw notFound(`Produit introuvable : ${id}`)

  if (body.slug) {
    const clash = await prisma.product.findUnique({
      where: { slug: body.slug },
      select: { id: true },
    })
    if (clash && clash.id !== id) throw conflict('SLUG_TAKEN', `Le slug « ${body.slug} » est déjà utilisé.`)
  }
  if (body.categoryId != null) await assertCategory(body.categoryId)

  const product = await prisma.product.update({
    where: { id },
    // Only the keys actually sent are written, so a partial edit cannot blank
    // a field the form did not include.
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.slug !== undefined ? { slug: body.slug } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.basePrice !== undefined ? { basePrice: body.basePrice } : {}),
      ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
      ...(body.typeId !== undefined ? { typeId: body.typeId } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
      ...(body.supplier !== undefined ? { supplier: body.supplier } : {}),
      ...(body.arrivalDate !== undefined
        ? { arrivalDate: body.arrivalDate ? toUtcDate(body.arrivalDate) : null }
        : {}),
    },
    select: productSelect,
  })
  return withStockTotals(product)
}

/**
 * Hard-deletes a product, and only ever from here.
 *
 * Legitimate cases are all pre-sale: added by mistake, the supplier cancelled,
 * or the goods arrived, were rejected and went back. Once anything has sold,
 * `active = false` is the only correct move -- an order line whose product row
 * vanished loses its link to the catalogue even though the snapshot columns
 * keep it readable.
 *
 * The guard counts order lines through Variant, because OrderItem has no direct
 * relation to Product.
 */
export async function deleteProduct(id: number) {
  const product = await prisma.product.findUnique({
    where: { id },
    select: { id: true, name: true, images: true, _count: { select: { variants: true } } },
  })
  if (!product) throw notFound(`Produit introuvable : ${id}`)

  const lines = await prisma.orderItem.count({ where: { variant: { productId: id } } })
  if (lines > 0) {
    throw conflict(
      'PRODUCT_IN_USE',
      `« ${product.name} » figure sur ${lines} ligne(s) de commande. Passez-le en « Inactif » plutôt que de le supprimer.`,
      { orderLines: lines },
    )
  }

  // Drop the photos first. If this fails we still delete the product -- an
  // orphaned object costs a little storage, a blocked delete costs the owner
  // the whole operation.
  let imagesRemoved = 0
  for (const url of product.images) {
    const path = pathFromPublicUrl(url)
    if (!path) continue
    try {
      await removeObject(path)
      imagesRemoved++
    } catch {
      // best effort, deliberately swallowed
    }
  }

  // Variants go with it: Product -> Variant is Cascade in the schema.
  await prisma.product.delete({ where: { id } })

  return {
    deleted: true,
    name: product.name,
    variantsRemoved: product._count.variants,
    imagesRemoved,
  }
}

export async function listProductTypes() {
  return prisma.productType.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true, _count: { select: { products: true } } },
  })
}

/** Created inline from the product form, so the owner never leaves the page. */
export async function createProductType(name: string) {
  const slug = slugify(name)
  if (!slug) throw badRequest('BAD_SLUG', 'Impossible de générer un slug depuis ce nom.')
  const clash = await prisma.productType.findUnique({ where: { slug }, select: { id: true } })
  if (clash) throw conflict('TYPE_EXISTS', `Le type « ${name} » existe déjà.`)
  return prisma.productType.create({
    data: { name, slug },
    select: { id: true, name: true, slug: true },
  })
}

async function assertCategory(categoryId: number) {
  const cat = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } })
  if (!cat) throw badRequest('UNKNOWN_CATEGORY', `Catégorie introuvable : ${categoryId}`)
}

// --------------------------------------------------------------------------
// Variants
// --------------------------------------------------------------------------

export async function createVariant(productId: number, body: VariantCreateBody) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } })
  if (!product) throw notFound(`Produit introuvable : ${productId}`)

  const [skuClash, comboClash] = await Promise.all([
    prisma.variant.findUnique({ where: { sku: body.sku }, select: { id: true } }),
    prisma.variant.findUnique({
      where: { productId_size_color: { productId, size: body.size, color: body.color } },
      select: { id: true },
    }),
  ])
  if (skuClash) throw conflict('SKU_TAKEN', `Le SKU « ${body.sku} » existe déjà.`)
  if (comboClash) {
    throw conflict('VARIANT_EXISTS', `Ce produit a déjà une déclinaison ${body.size} / ${body.color}.`)
  }

  return prisma.variant.create({
    data: {
      productId,
      size: body.size,
      color: body.color,
      sku: body.sku,
      stock: body.stock,
      priceOverride: body.priceOverride ?? null,
    },
    select: { id: true, size: true, color: true, sku: true, stock: true, priceOverride: true },
  })
}

export async function updateVariant(id: number, body: VariantUpdateBody) {
  const existing = await prisma.variant.findUnique({
    where: { id },
    select: { id: true, productId: true, size: true, color: true },
  })
  if (!existing) throw notFound(`Déclinaison introuvable : ${id}`)

  if (body.sku) {
    const clash = await prisma.variant.findUnique({ where: { sku: body.sku }, select: { id: true } })
    if (clash && clash.id !== id) throw conflict('SKU_TAKEN', `Le SKU « ${body.sku} » existe déjà.`)
  }

  const size = body.size ?? existing.size
  const color = body.color ?? existing.color
  if (size !== existing.size || color !== existing.color) {
    const clash = await prisma.variant.findUnique({
      where: { productId_size_color: { productId: existing.productId, size, color } },
      select: { id: true },
    })
    if (clash && clash.id !== id) {
      throw conflict('VARIANT_EXISTS', `Ce produit a déjà une déclinaison ${size} / ${color}.`)
    }
  }

  return prisma.variant.update({
    where: { id },
    data: {
      ...(body.size !== undefined ? { size: body.size } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
      ...(body.sku !== undefined ? { sku: body.sku } : {}),
      ...(body.stock !== undefined ? { stock: body.stock } : {}),
      ...(body.priceOverride !== undefined ? { priceOverride: body.priceOverride } : {}),
    },
    select: { id: true, size: true, color: true, sku: true, stock: true, priceOverride: true },
  })
}

export async function deleteVariant(id: number) {
  const variant = await prisma.variant.findUnique({
    where: { id },
    select: { id: true, sku: true, _count: { select: { items: true } } },
  })
  if (!variant) throw notFound(`Déclinaison introuvable : ${id}`)

  // The schema would survive this — OrderItem.variantId is SetNull and the
  // snapshot columns keep history readable — but the order line would lose its
  // link back to the live catalogue. Retiring by stock is reversible; this isn't.
  if (variant._count.items > 0) {
    throw conflict(
      'VARIANT_IN_USE',
      `« ${variant.sku} » figure sur ${variant._count.items} commande(s). Mettez son stock à 0 plutôt que de la supprimer.`,
      { orderLines: variant._count.items },
    )
  }

  await prisma.variant.delete({ where: { id } })
  return { deleted: true, sku: variant.sku }
}

export async function lowStock() {
  // Returns the WHOLE variant set, not just the low ones. The stock page needs
  // a "Tout" view and a name search, and 124 rows is a few KB -- fetching once
  // and filtering in the browser beats a ~170ms round trip per keystroke.
  const variants = await prisma.variant.findMany({
    orderBy: [{ stock: 'asc' }, { sku: 'asc' }],
    select: {
      id: true,
      size: true,
      color: true,
      sku: true,
      stock: true,
      product: { select: { id: true, name: true, slug: true, active: true } },
    },
  })

  // Facets from the full set, so a dropdown never loses an option just because
  // the current filter excludes it.
  const sizes = [...new Set(variants.map((v) => v.size))].sort()
  const colors = [...new Set(variants.map((v) => v.color))].sort((a, b) => a.localeCompare(b, 'fr'))

  return {
    threshold: LOW_STOCK_THRESHOLD,
    outOfStock: variants.filter((v) => v.stock === 0).length,
    lowCount: variants.filter((v) => v.stock > 0 && v.stock <= LOW_STOCK_THRESHOLD).length,
    facets: { sizes, colors },
    data: variants,
  }
}


// --------------------------------------------------------------------------
// Images
// --------------------------------------------------------------------------

export async function attachImage(productId: number, path: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { images: true },
  })
  if (!product) throw notFound(`Produit introuvable : ${productId}`)

  const url = publicUrl(path)
  if (product.images.includes(url)) return { images: product.images }

  const updated = await prisma.product.update({
    where: { id: productId },
    data: { images: { set: [...product.images, url] } },
    select: { images: true },
  })
  return updated
}

export async function detachImage(productId: number, url: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { images: true },
  })
  if (!product) throw notFound(`Produit introuvable : ${productId}`)

  const updated = await prisma.product.update({
    where: { id: productId },
    data: { images: { set: product.images.filter((i) => i !== url) } },
    select: { images: true },
  })

  // Drop the object too, so removing an image does not silently leave an
  // orphan paying for storage forever.
  const path = pathFromPublicUrl(url)
  if (path) await removeObject(path).catch(() => undefined)

  return updated
}
