import { Router } from 'express'
import { ProductListQuery } from '../schemas/product.schema.js'
import { getProductBySlug, listProducts } from '../services/products.service.js'

export const productsRouter = Router()

// Express 5 forwards async rejections to the error handler, so a thrown
// ZodError or HttpError needs no try/catch here.
productsRouter.get('/', async (req, res) => {
  const query = ProductListQuery.parse(req.query)
  res.json(await listProducts(query))
})

productsRouter.get('/:slug', async (req, res) => {
  res.json(await getProductBySlug(req.params.slug))
})
