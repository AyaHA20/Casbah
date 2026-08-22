import { prisma } from '../lib/prisma.js'
import { notFound } from '../lib/http-error.js'
import type { ProductListQuery } from '../schemas/product.schema.js'

export async function listProducts(query: ProductListQuery) {
  const where = {
    active: true,
    ...(query.category ? { category: { slug: query.category } } : {}),
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
