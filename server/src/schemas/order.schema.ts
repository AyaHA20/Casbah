import { z } from 'zod'

// Algerian mobile numbers: 05, 06 or 07 followed by eight digits.
const PHONE_RE = /^0[5-7]\d{8}$/

/**
 * The order payload carries NO prices — not unitPrice, not subtotal, not
 * shipping, not total. Every one of those is looked up or computed server-side.
 *
 * zod objects strip unknown keys by default, so a client that helpfully sends
 * `"total": 1` has that field silently discarded here, before any code can be
 * tempted to read it. That stripping is the first line of the defence; the
 * second is that the order service never references req.body for money at all.
 */
export const CreateOrderBody = z.object({
  customerName: z.string().trim().min(3, 'Nom trop court.').max(120),
  phone: z
    .string()
    .trim()
    .regex(PHONE_RE, 'Numéro invalide. Format attendu : 0X XX XX XX XX (05, 06 ou 07).'),
  wilayaCode: z.number().int().min(1, 'Wilaya invalide.').max(69, 'Wilaya invalide.'),
  communeId: z.number().int().positive('Commune invalide.'),
  address: z.string().trim().min(5, 'Adresse trop courte.').max(300),
  deliveryType: z.enum(['DESK', 'HOME']),
  notes: z.string().trim().max(500).nullish(),
  items: z
    .array(
      z.object({
        variantId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1, 'Le panier est vide.')
    .max(50),
})

export type CreateOrderBody = z.infer<typeof CreateOrderBody>
