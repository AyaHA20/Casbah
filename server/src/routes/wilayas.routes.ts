import { Router } from 'express'
import { WilayaCodeParam } from '../schemas/product.schema.js'
import { listCommunes, listWilayas } from '../services/wilayas.service.js'

export const wilayasRouter = Router()

wilayasRouter.get('/', async (_req, res) => {
  res.json(await listWilayas())
})

// `:code` is the public wilaya code (1-69), the same identifier POST /api/orders
// validates. Named `:code` rather than `:id` because Wilaya.id and Wilaya.code
// currently hold identical values, so a mix-up would stay invisible until a
// reseed shifted the ids.
wilayasRouter.get('/:code/communes', async (req, res) => {
  const code = WilayaCodeParam.parse(req.params.code)
  res.json(await listCommunes(code))
})
