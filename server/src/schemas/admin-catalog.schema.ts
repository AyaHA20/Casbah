import { z } from 'zod'

/**
 * An empty <input> submits "", not null. Treat "" as "no value" so clearing a
 * field in the form means the same thing as never filling it — otherwise an
 * untouched optional field rejects the whole request.
 */
const emptyToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? null : v), schema)

export const ProductListQueryAdmin = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  category: z.string().trim().min(1).optional(),
  // Admin sees retired products too, so `active` is a filter rather than a fixed rule.
  active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  // Sorting is server-side because the list is paginated -- sorting in the
  // browser would only reorder the current page.
  sort: z.enum(['recent', 'arrival', 'name']).default('recent'),
})
export type ProductListQueryAdmin = z.infer<typeof ProductListQueryAdmin>

export const ProductCreateBody = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(5).max(2000),
  basePrice: z.number().int().min(0).max(10_000_000),
  categoryId: z.number().int().positive().nullable().optional(),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug invalide.')
    .optional(),
  typeId: emptyToNull(z.number().int().positive().nullable().optional()),
  supplier: emptyToNull(z.string().trim().max(120).nullable().optional()),
  gender: emptyToNull(z.enum(['FEMME', 'HOMME', 'UNISEXE']).nullable().optional()),
  // Written by hand; empty means "not translated yet", never a blank name.
  nameAr: emptyToNull(z.string().trim().max(120).nullable().optional()),
  descriptionAr: emptyToNull(z.string().trim().max(2000).nullable().optional()),
  // Date-only, as an <input type="date"> sends it. Kept as a plain string here
  // and converted at UTC midnight in the service, so a shop in Algiers and a
  // server in Ohio never disagree about which day the goods landed.
  arrivalDate: emptyToNull(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ).')
      .nullable()
      .optional(),
  ),
})
export type ProductCreateBody = z.infer<typeof ProductCreateBody>

export const ProductUpdateBody = ProductCreateBody.partial().extend({
  active: z.boolean().optional(),
})
export type ProductUpdateBody = z.infer<typeof ProductUpdateBody>

export const VariantCreateBody = z.object({
  size: z.string().trim().min(1).max(12),
  color: z.string().trim().min(1).max(40),
  sku: z.string().trim().min(2).max(40),
  stock: z.number().int().min(0).max(100_000).default(0),
  priceOverride: z.number().int().min(0).max(10_000_000).nullable().optional(),
})
export type VariantCreateBody = z.infer<typeof VariantCreateBody>

export const VariantUpdateBody = VariantCreateBody.partial()
export type VariantUpdateBody = z.infer<typeof VariantUpdateBody>

export const SignUploadBody = z.object({
  filename: z.string().trim().min(1).max(200),
})

export const ImageAttachBody = z.object({
  path: z.string().trim().min(1).max(300),
  // Null / absent = the shared set every colour falls back to.
  color: emptyToNull(z.string().trim().max(40).nullable().optional()),
})

export const ImageDeleteBody = z.object({
  imageId: z.number().int().positive(),
})

export const ImageDetachBody = z.object({
  url: z.string().trim().min(1).max(500),
})

