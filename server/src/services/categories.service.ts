import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { conflict, notFound } from '../lib/http-error.js'
import { slugify } from './admin-catalog.service.js'

/**
 * Categories are sections of the shop — Nouveautés, Soldes, Collection été.
 *
 * They are deliberately NOT gendered: who a garment is for lives on
 * Product.gender and nowhere else. Filing a product under "Femme" as well as
 * setting its gender is how the two fields started contradicting each other.
 */
export const CategoryBody = z.object({
  name: z.string().trim().min(2).max(60),
  nameAr: z
    .preprocess((v) => (v === '' ? null : v), z.string().trim().max(60).nullable().optional()),
})
export type CategoryBody = z.infer<typeof CategoryBody>

export const CategoryUpdateBody = CategoryBody.partial()
export type CategoryUpdateBody = z.infer<typeof CategoryUpdateBody>

const select = {
  id: true,
  name: true,
  nameAr: true,
  slug: true,
  _count: { select: { products: true } },
} as const

export async function listCategories() {
  return prisma.category.findMany({ orderBy: { name: 'asc' }, select })
}

export async function createCategory(body: CategoryBody) {
  const slug = slugify(body.name)
  if (!slug) throw conflict('BAD_SLUG', 'Impossible de générer un slug depuis ce nom.')

  const clash = await prisma.category.findUnique({ where: { slug }, select: { id: true } })
  if (clash) throw conflict('CATEGORY_EXISTS', `Le rayon « ${body.name} » existe déjà.`)

  return prisma.category.create({
    data: { name: body.name, nameAr: body.nameAr ?? null, slug },
    select,
  })
}

export async function updateCategory(id: number, body: CategoryUpdateBody) {
  const existing = await prisma.category.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw notFound(`Rayon introuvable : ${id}`)

  // The slug is deliberately NOT re-derived on rename: it is in storefront URLs
  // and saved filters, exactly like a product slug.
  return prisma.category.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.nameAr !== undefined ? { nameAr: body.nameAr } : {}),
    },
    select,
  })
}

export async function deleteCategory(id: number) {
  const cat = await prisma.category.findUnique({
    where: { id },
    select: { id: true, name: true, _count: { select: { products: true } } },
  })
  if (!cat) throw notFound(`Rayon introuvable : ${id}`)

  // Product.categoryId is SetNull, so this would succeed and quietly leave
  // products uncategorised. Refusing is louder and reversible — move them first.
  if (cat._count.products > 0) {
    throw conflict(
      'CATEGORY_IN_USE',
      `« ${cat.name} » contient ${cat._count.products} produit(s). Déplacez-les avant de le supprimer.`,
      { products: cat._count.products },
    )
  }

  await prisma.category.delete({ where: { id } })
  return { deleted: true, name: cat.name }
}
