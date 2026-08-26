import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { badRequest, notFound } from '../lib/http-error.js'
import type { Carrier } from '../../generated/prisma/enums.js'

export const CarrierEnum = z.enum(['YALIDINE', 'ZR_EXPRESS', 'OTHER'])

export const RateListQuery = z.object({
  carrier: CarrierEnum.default('OTHER'),
})

export const RateUpsertBody = z.object({
  carrier: CarrierEnum,
  rates: z
    .array(
      z.object({
        wilayaCode: z.number().int().min(1).max(69),
        deskPrice: z.number().int().min(0).max(1_000_000),
        homePrice: z.number().int().min(0).max(1_000_000),
      }),
    )
    .min(1)
    .max(69),
})

export const SetDefaultBody = z.object({
  carrier: CarrierEnum,
  wilayaCodes: z.array(z.number().int().min(1).max(69)).min(1).max(69),
})

/**
 * Every wilaya, joined to this carrier's rate.
 *
 * Returns all 69 rows whether or not a rate exists for the carrier — the page
 * has to be able to CREATE a Yalidine price list, not just edit one, and today
 * only OTHER rows exist.
 */
export async function listRates(carrier: Carrier) {
  const wilayas = await prisma.wilaya.findMany({
    orderBy: { code: 'asc' },
    select: {
      id: true,
      code: true,
      nameFr: true,
      nameAr: true,
      shippingRates: {
        select: { id: true, carrier: true, deskPrice: true, homePrice: true, isDefault: true },
      },
    },
  })

  return {
    carrier,
    data: wilayas.map(({ shippingRates, ...w }) => {
      const forCarrier = shippingRates.find((r) => r.carrier === carrier) ?? null
      // Which carrier this wilaya actually ships with today — the page shows it
      // so the owner can see what checkout will charge, not just what they are editing.
      const current = shippingRates.find((r) => r.isDefault) ?? null
      return {
        ...w,
        rate: forCarrier,
        defaultCarrier: current?.carrier ?? null,
        isDefault: forCarrier?.isDefault ?? false,
      }
    }),
  }
}

/** Upsert a batch of rates. Covers both inline edit and bulk edit. */
export async function upsertRates(body: z.infer<typeof RateUpsertBody>) {
  const codes = body.rates.map((r) => r.wilayaCode)
  const wilayas = await prisma.wilaya.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  })
  const idByCode = new Map(wilayas.map((w) => [w.code, w.id]))

  const missing = codes.filter((c) => !idByCode.has(c))
  if (missing.length > 0) {
    throw badRequest('UNKNOWN_WILAYA', `Wilaya(s) inconnue(s) : ${missing.join(', ')}`)
  }

  // One transaction: a half-written price list would charge some customers the
  // old rate and some the new one, with no way to tell which.
  await prisma.$transaction(
    body.rates.map((r) => {
      const wilayaId = idByCode.get(r.wilayaCode)!
      return prisma.shippingRate.upsert({
        where: { wilayaId_carrier: { wilayaId, carrier: body.carrier } },
        update: { deskPrice: r.deskPrice, homePrice: r.homePrice },
        // A brand-new carrier row is never default: switching which carrier a
        // wilaya ships with is a separate, deliberate action.
        create: {
          wilayaId,
          carrier: body.carrier,
          deskPrice: r.deskPrice,
          homePrice: r.homePrice,
          isDefault: false,
        },
      })
    }),
  )

  return listRates(body.carrier)
}

/**
 * Moves `isDefault` to this carrier for the given wilayas.
 *
 * The partial unique index `ShippingRate_one_default_per_wilaya` allows exactly
 * one default row per wilaya, so the old default MUST be cleared before the new
 * one is set — in the same transaction, or Postgres rejects the write and the
 * wilaya is left with no default at all, which would break checkout.
 */
export async function setDefaultCarrier(body: z.infer<typeof SetDefaultBody>) {
  const wilayas = await prisma.wilaya.findMany({
    where: { code: { in: body.wilayaCodes } },
    select: { id: true, code: true, shippingRates: { select: { carrier: true } } },
  })
  if (wilayas.length !== body.wilayaCodes.length) {
    throw badRequest('UNKNOWN_WILAYA', 'Wilaya inconnue.')
  }

  const withoutRate = wilayas.filter((w) => !w.shippingRates.some((r) => r.carrier === body.carrier))
  if (withoutRate.length > 0) {
    throw badRequest(
      'NO_RATE_FOR_CARRIER',
      `Aucun tarif ${body.carrier} pour : ${withoutRate.map((w) => w.code).join(', ')}. Enregistrez d'abord les prix.`,
      { wilayaCodes: withoutRate.map((w) => w.code) },
    )
  }

  const ids = wilayas.map((w) => w.id)
  await prisma.$transaction([
    // Clear first — the index permits only one true per wilaya at a time.
    prisma.shippingRate.updateMany({
      where: { wilayaId: { in: ids }, isDefault: true },
      data: { isDefault: false },
    }),
    prisma.shippingRate.updateMany({
      where: { wilayaId: { in: ids }, carrier: body.carrier },
      data: { isDefault: true },
    }),
  ])

  return listRates(body.carrier)
}

export async function deleteRate(id: number) {
  const rate = await prisma.shippingRate.findUnique({
    where: { id },
    select: { id: true, isDefault: true, carrier: true },
  })
  if (!rate) throw notFound(`Tarif introuvable : ${id}`)
  if (rate.isDefault) {
    throw badRequest(
      'RATE_IS_DEFAULT',
      "Ce tarif est celui utilisé au paiement. Choisissez d'abord un autre transporteur pour cette wilaya.",
    )
  }
  await prisma.shippingRate.delete({ where: { id } })
  return { deleted: true }
}
