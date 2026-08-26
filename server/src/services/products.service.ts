import { prisma } from '../lib/prisma.js'
import { notFound } from '../lib/http-error.js'
import { cardImages, galleriesForProducts, listImages } from './product-images.service.js'
import type { ProductListQuery } from '../schemas/product.schema.js'

export async function listProducts(query: ProductListQuery) {
  const where = {
    active: true,
    ...(query.category ? { category: { slug: query.category } } : {}),
    ...(query.type ? { type: { slug: query.type } } : {}),
    // Colour lives on Variant, so "a red product" means "has at least one red
    // variant". `some` keeps this a single query rather than a post-filter.
    ...(query.color ? { variants: { some: { color: query.color } } } : {}),
    // UNISEXE is not a third bucket: a unisex garment belongs under BOTH the
    // Femme and Homme filters, so this widens rather than matching one value.
    // Products with no gender set appear under neither until classified.
    ...(query.gender ? { gender: { in: [query.gender, 'UNISEXE' as const] } } : {}),
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
        nameAr: true,
        slug: true,
        basePrice: true,
        images: true,
        gender: true,
        category: { select: { name: true, nameAr: true, slug: true } },
        type: { select: { name: true, nameAr: true, slug: true } },
        // Stock lives on Variant, so "is this product buyable" is only
        // answerable by looking at its variants.
        variants: { select: { stock: true } },
      },
    }),
  ])

  // Cards must follow the same fallback chain as the detail page, or a product
  // photographed per-colour renders the placeholder here while showing fine one
  // click away.
  const galleries = await galleriesForProducts(rows.map((r) => r.id))

  const data = rows.map(({ variants, ...product }) => ({
    ...product,
    images: cardImages(galleries.get(product.id), product.images),
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
      nameAr: true,
      slug: true,
      description: true,
      descriptionAr: true,
      basePrice: true,
      images: true,
      gender: true,
      createdAt: true,
      category: { select: { name: true, nameAr: true, slug: true } },
      type: { select: { name: true, nameAr: true, slug: true } },
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

  // Per-colour galleries alongside the legacy flat list. The client resolves
  // which set to show; the fallback chain lives in one place on both sides.
  const galleries = await listImages(product.id)

  return {
    ...product,
    galleries,
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
    // Same rule as colours: a section with nothing live in it is a chip that
    // leads to an empty grid. nameAr is selected because the filter bar
    // localizes these labels — without it the Arabic chips fall back to French.
    prisma.category.findMany({
      where: { products: { some: { active: true } } },
      orderBy: { name: 'asc' },
      select: { name: true, nameAr: true, slug: true },
    }),
    prisma.productType.findMany({
      where: { products: { some: { active: true } } },
      orderBy: { name: 'asc' },
      select: { name: true, nameAr: true, slug: true },
    }),
    prisma.variant.findMany({
      where: { product: { active: true } },
      distinct: ['color'],
      orderBy: { color: 'asc' },
      select: { color: true },
    }),
  ])
  return { categories, types, colors: colors.map((c) => c.color) }
}
