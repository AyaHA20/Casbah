import { prisma } from '../lib/prisma.js'
import { HttpError, badRequest, conflict, notFound } from '../lib/http-error.js'
import type { CreateOrderBody } from '../schemas/order.schema.js'
import { allocateOrderNumber } from './order-number.js'

type Line = {
  variantId: number
  quantity: number
  unitPrice: number
  productName: string
  variantSize: string
  variantColor: string
  sku: string
}

export async function createOrder(input: CreateOrderBody) {
  // --- 1. Destination, and proof the two parts agree -----------------------
  const wilaya = await prisma.wilaya.findUnique({
    where: { code: input.wilayaCode },
    select: { id: true, nameFr: true },
  })
  if (!wilaya) throw notFound(`Wilaya introuvable : ${input.wilayaCode}`)

  const commune = await prisma.commune.findUnique({
    where: { id: input.communeId },
    select: { id: true, wilayaId: true, name: true },
  })
  if (!commune) throw notFound(`Commune introuvable : ${input.communeId}`)

  // Without this check a customer could pick a commune belonging to a cheaper
  // wilaya and be charged that wilaya's shipping while we ship somewhere else.
  if (commune.wilayaId !== wilaya.id) {
    throw badRequest(
      'COMMUNE_WILAYA_MISMATCH',
      `La commune sélectionnée n'appartient pas à la wilaya ${input.wilayaCode}.`,
    )
  }

  // --- 2. Shipping, from the database ---------------------------------------
  const rate = await prisma.shippingRate.findFirst({
    where: { wilayaId: wilaya.id, isDefault: true },
    select: { deskPrice: true, homePrice: true },
  })
  // Never fall back to zero. A missing rate is a misconfiguration, and shipping
  // free by accident is worse than refusing the order.
  if (!rate) {
    throw new HttpError(
      500,
      'NO_SHIPPING_RATE',
      `Aucun tarif de livraison configuré pour la wilaya ${input.wilayaCode}.`,
    )
  }
  const shipping = input.deliveryType === 'DESK' ? rate.deskPrice : rate.homePrice

  // --- 3. Price every line from the catalogue -------------------------------
  // Merge duplicate variantIds first: two cart lines for the same variant must
  // be checked against stock as one combined quantity, not twice against the
  // full amount.
  const merged = new Map<number, number>()
  for (const item of input.items) {
    merged.set(item.variantId, (merged.get(item.variantId) ?? 0) + item.quantity)
  }

  const variants = await prisma.variant.findMany({
    where: { id: { in: [...merged.keys()] } },
    select: {
      id: true,
      size: true,
      color: true,
      sku: true,
      stock: true,
      priceOverride: true,
      product: { select: { name: true, basePrice: true, active: true } },
    },
  })
  const byId = new Map(variants.map((v) => [v.id, v]))

  const lines: Line[] = []
  const insufficient: Array<{ sku: string; requested: number; available: number }> = []

  for (const [variantId, quantity] of merged) {
    const variant = byId.get(variantId)
    if (!variant) throw notFound(`Article introuvable : ${variantId}`)
    if (!variant.product.active) {
      throw badRequest(
        'PRODUCT_INACTIVE',
        `« ${variant.product.name} » n'est plus disponible à la vente.`,
      )
    }
    if (variant.stock < quantity) {
      insufficient.push({ sku: variant.sku, requested: quantity, available: variant.stock })
    }

    lines.push({
      variantId: variant.id,
      quantity,
      // Catalogue price. The request body has no price fields at all — see
      // schemas/order.schema.ts.
      unitPrice: variant.priceOverride ?? variant.product.basePrice,
      productName: variant.product.name,
      variantSize: variant.size,
      variantColor: variant.color,
      sku: variant.sku,
    })
  }

  // Friendly pre-check so the common case returns every problem line at once.
  // It is not the safety net — the conditional decrement below is.
  if (insufficient.length > 0) {
    throw conflict(
      'OUT_OF_STOCK',
      'Certains articles ne sont plus disponibles en quantité suffisante.',
      insufficient,
    )
  }

  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
  const total = subtotal + shipping
  const year = new Date().getFullYear()

  // ---------------------------------------------------------------------------
  // This must be all-or-nothing.
  //
  // Three things happen below: the order is created, its line items are written
  // with a frozen copy of what was sold, and stock comes off the shelf. If any
  // one of them lands without the others, the shop is wrong in a way nobody
  // notices until it costs money:
  //
  //   order created, stock not taken    -> the last item sells twice
  //   stock taken, order not created    -> inventory vanishes, nobody was charged
  //   order created, items not written  -> an order for nothing, unfulfillable
  //
  // Postgres gives us all-or-nothing for free inside a transaction. The only
  // real job here is making sure every one of those writes uses `tx`, never the
  // outer `prisma` client — a stray `prisma` call would commit on its own and
  // survive a rollback.
  // ---------------------------------------------------------------------------
  return prisma.$transaction(
    async (tx) => {
      // Taken first, before any row is touched. If we locked rows first and
      // grabbed this after, two orders could deadlock: A holding variant rows
      // waiting for the lock, B holding the lock waiting for A's rows.
      const orderNumber = await allocateOrderNumber(tx, year)

      for (const line of lines) {
        // The `where` clause IS the stock check. Testing stock and then writing
        // it as two statements leaves a gap where another checkout takes the
        // last unit and both orders succeed. Here Postgres locks the row and
        // re-reads it as part of the same statement, so there is no gap.
        const result = await tx.variant.updateMany({
          where: { id: line.variantId, stock: { gte: line.quantity } },
          data: { stock: { decrement: line.quantity } },
        })

        // count === 0 means the row no longer satisfies `stock >= quantity`:
        // someone else got there first. Roll the whole thing back.
        if (result.count === 0) {
          throw conflict(
            'OUT_OF_STOCK',
            `« ${line.productName} » (${line.variantSize} / ${line.variantColor}) n'est plus disponible en quantité suffisante.`,
            { sku: line.sku, requested: line.quantity },
          )
        }
      }

      return tx.order.create({
        data: {
          orderNumber,
          customerName: input.customerName,
          phone: input.phone,
          wilayaId: wilaya.id,
          communeId: commune.id,
          address: input.address,
          deliveryType: input.deliveryType,
          subtotal,
          shipping,
          total,
          notes: input.notes ?? null,
          items: {
            create: lines.map((l) => ({
              variantId: l.variantId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              // Snapshot columns: frozen now so renaming a product or deleting
              // a variant later cannot rewrite what this order says was sold.
              productName: l.productName,
              variantSize: l.variantSize,
              variantColor: l.variantColor,
              sku: l.sku,
            })),
          },
        },
        select: {
          orderNumber: true,
          subtotal: true,
          shipping: true,
          total: true,
          status: true,
        },
      })
    },
    // The 5s default is tight against a cold Neon compute with several round
    // trips inside the transaction.
    { timeout: 15_000, maxWait: 5_000 },
  )
}
