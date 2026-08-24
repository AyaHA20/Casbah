import { Router } from 'express'
import { ProductListQuery } from '../schemas/product.schema.js'
import { getProductBySlug, listFilters, listProducts } from '../services/products.service.js'
import { getStorefront } from '../services/settings.service.js'

export const productsRouter = Router()

// Express 5 forwards async rejections to the error handler, so a thrown
// ZodError or HttpError needs no try/catch here.
productsRouter.get('/', async (req, res) => {
  const query = ProductListQuery.parse(req.query)
  res.json(await listProducts(query))
})

// Both must be declared before '/:slug', or they are read as product slugs.
productsRouter.get('/storefront', async (_req, res) => {
  res.json(await getStorefront())
})

// Must be declared before '/:slug', or "filters" is read as a product slug.
productsRouter.get('/filters', async (_req, res) => {
  res.json(await listFilters())
})

productsRouter.get('/:slug', async (req, res) => {
  res.json(await getProductBySlug(req.params.slug))
})
