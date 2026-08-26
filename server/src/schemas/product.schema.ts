import { z } from 'zod'

export const ProductListQuery = z.object({
  category: z.string().trim().min(1).optional(),
  // Combined, never either/or: category AND type AND colour all narrow together.
  type: z.string().trim().min(1).optional(),
  color: z.string().trim().min(1).optional(),
  // Only the two a customer can pick. UNISEXE is never sent — it is folded
  // into both by the query below.
  gender: z.enum(['FEMME', 'HOMME']).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  // Capped so a client cannot ask for the whole catalogue in one request.
  limit: z.coerce.number().int().min(1).max(48).default(12),
})

export type ProductListQuery = z.infer<typeof ProductListQuery>

export const WilayaCodeParam = z.coerce
  .number()
  .int()
  .min(1, 'Code wilaya invalide.')
  .max(69, 'Code wilaya invalide.')
