import { prisma } from '../lib/prisma.js'
import { notFound } from '../lib/http-error.js'

export async function listWilayas() {
  const rows = await prisma.wilaya.findMany({
    orderBy: { code: 'asc' },
    select: {
      code: true,
      nameFr: true,
      nameAr: true,
      shippingRates: {
        where: { isDefault: true },
        take: 1,
        select: { carrier: true, deskPrice: true, homePrice: true },
      },
    },
  })

  return rows.map(({ shippingRates, ...wilaya }) => {
    const rate = shippingRates[0]
    return {
      ...wilaya,
      // Null rather than a made-up number: a wilaya with no configured rate is
      // a configuration gap the frontend should surface, not paper over.
      deskPrice: rate?.deskPrice ?? null,
      homePrice: rate?.homePrice ?? null,
      carrier: rate?.carrier ?? null,
    }
  })
}

export async function listCommunes(code: number) {
  // Keyed on `code`, the public 1-69 identifier used everywhere in the API,
  // not on the autoincrement id. They happen to be equal today, which is
  // exactly why this must be explicit.
  const wilaya = await prisma.wilaya.findUnique({
    where: { code },
    select: { id: true, nameFr: true },
  })
  if (!wilaya) throw notFound(`Wilaya introuvable : ${code}`)

  const communes = await prisma.commune.findMany({
    where: { wilayaId: wilaya.id },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })

  return { wilaya: { code, nameFr: wilaya.nameFr }, communes }
}
