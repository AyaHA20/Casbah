import { z } from 'zod'

const STATUSES = [
  'PENDING',
  'CONFIRMED',
  'SHIPPED',
  'DELIVERED',
  'RETURNED',
  'CANCELLED',
] as const

export const LoginBody = z.object({
  email: z.string().trim().email('Adresse e-mail invalide.'),
  password: z.string().min(1, 'Mot de passe requis.'),
})
export type LoginBody = z.infer<typeof LoginBody>

export const OrderListQuery = z.object({
  status: z.enum(STATUSES).optional(),
  // Partial phone is fine — the admin types the first digits they remember.
  phone: z.string().trim().min(2).max(20).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
export type OrderListQuery = z.infer<typeof OrderListQuery>

export const StatusPatchBody = z.object({
  status: z.enum(STATUSES),
})
export type StatusPatchBody = z.infer<typeof StatusPatchBody>

export const IdParam = z.coerce.number().int().positive()
