import { z } from 'zod'

export const ProductListQuery = z.object({
  category: z.string().trim().min(1).optional(),
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
