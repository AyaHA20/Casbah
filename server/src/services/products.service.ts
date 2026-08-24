import { prisma } from '../lib/prisma.js'
import { notFound } from '../lib/http-error.js'
import type { ProductListQuery } from '../schemas/product.schema.js'

export async function listProducts(query: ProductListQuery) {
  const where = {
    active: true,
    ...(query.category ? { category: { slug: query.category } } : {}),
    ...(query.type ? { type: { slug: query.type } } : {}),
    // Colour lives on Variant, so "a red product" means "has at least one red
    // variant". `some` keeps this a single query rather than a post-filter.
    ...(query.color ? { variants: { some: { color: query.color } } } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' as const } },
            { description: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        name: true,
        slug: true,
        basePrice: true,
        images: true,
        category: { select: { name: true, slug: true } },
        type: { select: { name: true, slug: true } },
        // Stock lives on Variant, so "is this product buyable" is only
        // answerable by looking at its variants.
        variants: { select: { stock: true } },
      },
    }),
  ])

  const data = rows.map(({ variants, ...product }) => ({
    ...product,
    inStock: variants.some((v) => v.stock > 0),
  }))

  return {
    data,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  }
}

export async function getProductBySlug(slug: string) {
  const product = await prisma.product.findFirst({
    where: { slug, active: true },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      basePrice: true,
      images: true,
      createdAt: true,
      category: { select: { name: true, slug: true } },
      type: { select: { name: true, slug: true } },
      variants: {
        orderBy: [{ color: 'asc' }, { size: 'asc' }],
        select: {
          id: true,
          size: true,
          color: true,
          stock: true,
          sku: true,
          priceOverride: true,
        },
      },
    },
  })

  if (!product) throw notFound(`Produit introuvable : ${slug}`)

  return {
    ...product,
    variants: product.variants.map((v) => ({
      ...v,
      // The price the customer actually pays. Resolved the same way here and in
      // the order service, so the displayed price matches the charged price.
      price: v.priceOverride ?? product.basePrice,
      available: v.stock > 0,
    })),
  }
}

/**
 * Everything the storefront filter bar needs, in one request.
 *
 * Colours come from the variants of live products only — offering a filter that
 * returns nothing is worse than not offering it.
 */
export async function listFilters() {
  const [categories, types, colors] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: 'asc' }, select: { name: true, slug: true } }),
    prisma.productType.findMany({ orderBy: { name: 'asc' }, select: { name: true, slug: true } }),
    prisma.variant.findMany({
      where: { product: { active: true } },
      distinct: ['color'],
      orderBy: { color: 'asc' },
      select: { color: true },
    }),
  ])
  return { categories, types, colors: colors.map((c) => c.color) }
}
