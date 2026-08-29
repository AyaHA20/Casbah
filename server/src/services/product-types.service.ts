import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { badRequest, conflict, notFound } from '../lib/http-error.js'
import { slugify } from './admin-catalog.service.js'

/**
 * What the garment IS — Robe, Chemise, Pantalon.
 *
 * Orthogonal to both Category and Gender: a robe is a robe whether it sits in
 * Nouveautés or Soldes and whoever wears it. Deliberately the same shape as
 * categories.service.ts, so the two cannot drift the way their selects did.
 */
export const ProductTypeBody = z.object({
  name: z.string().trim().min(2).max(60),
  nameAr: z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().trim().max(60).nullable().optional(),
  ),
})
export type ProductTypeBody = z.infer<typeof ProductTypeBody>

export const ProductTypeUpdateBody = ProductTypeBody.partial()
export type ProductTypeUpdateBody = z.infer<typeof ProductTypeUpdateBody>

const select = {
  id: true,
  name: true,
  nameAr: true,
  slug: true,
  _count: { select: { products: true } },
} as const

export async function listProductTypes() {
  return prisma.productType.findMany({ orderBy: { name: 'asc' }, select })
}

/** Created inline from the product form, so the owner never leaves the page. */
export async function createProductType(body: ProductTypeBody) {
  const slug = slugify(body.name)
  if (!slug) throw badRequest('BAD_SLUG', 'Impossible de générer un slug depuis ce nom.')

  const clash = await prisma.productType.findUnique({ where: { slug }, select: { id: true } })
  if (clash) throw conflict('TYPE_EXISTS', `Le type « ${body.name} » existe déjà.`)

  return prisma.productType.create({
    data: { name: body.name, nameAr: body.nameAr ?? null, slug },
    select,
  })
}

export async function updateProductType(id: number, body: ProductTypeUpdateBody) {
  const existing = await prisma.productType.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw notFound(`Type introuvable : ${id}`)

  // The slug is deliberately NOT re-derived on rename: it is in storefront
  // filter URLs, exactly as a category slug is.
  return prisma.productType.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.nameAr !== undefined ? { nameAr: body.nameAr } : {}),
    },
    select,
  })
}

export async function deleteProductType(id: number) {
  const type = await prisma.productType.findUnique({
    where: { id },
    select: { id: true, name: true, _count: { select: { products: true } } },
  })
  if (!type) throw notFound(`Type introuvable : ${id}`)

  // Product.typeId is SetNull, so this would succeed and quietly leave products
  // untyped. Refusing is louder and reversible — retype them first.
  if (type._count.products > 0) {
    throw conflict(
      'TYPE_IN_USE',
      `« ${type.name} » contient ${type._count.products} produit(s). Déplacez-les avant de le supprimer.`,
      { products: type._count.products },
    )
  }

  await prisma.productType.delete({ where: { id } })
  return { deleted: true, name: type.name }
}
