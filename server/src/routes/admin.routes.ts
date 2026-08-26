import { Router } from 'express'
import { requireAdmin } from '../middleware/require-admin.js'
import { isStorageConfigured, createSignedUpload } from '../lib/storage.js'
import { IdParam, LoginBody, OrderListQuery, StatusPatchBody } from '../schemas/admin.schema.js'
import {
  ImageAttachBody,
  ImageDeleteBody,
  ImageDetachBody,
  ProductCreateBody,
  ProductTypeCreateBody,
  ProductListQueryAdmin,
  ProductUpdateBody,
  SignUploadBody,
  VariantCreateBody,
  VariantUpdateBody,
} from '../schemas/admin-catalog.schema.js'
import {
  CategoryBody,
  CategoryUpdateBody,
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '../services/categories.service.js'
import { login } from '../services/admin-auth.service.js'
import {
  RateListQuery,
  RateUpsertBody,
  SetDefaultBody,
  deleteRate,
  listRates,
  setDefaultCarrier,
  upsertRates,
} from '../services/shipping-rates.service.js'
import {
  SettingsUpdateBody,
  getSettings,
  updateSettings,
} from '../services/settings.service.js'
import { changeStatus, getOrder, listOrders, stats } from '../services/admin-orders.service.js'
import { addImage, listImages, removeImage } from '../services/product-images.service.js'
import {
  attachImage,
  createProduct,
  createProductType,
  listProductTypes,
  deleteProduct,
  createVariant,
  deleteVariant,
  detachImage,
  getProductAdmin,
  listProductsAdmin,
  lowStock,
  updateProduct,
  updateVariant,
} from '../services/admin-catalog.service.js'

export const adminRouter = Router()

// Public: the only way in.
adminRouter.post('/login', async (req, res) => {
  const body = LoginBody.parse(req.body)
  res.json(await login(body))
})

// Everything below this line requires a valid admin token.
adminRouter.use(requireAdmin)

adminRouter.get('/orders', async (req, res) => {
  res.json(await listOrders(OrderListQuery.parse(req.query)))
})

adminRouter.get('/orders/:id', async (req, res) => {
  res.json(await getOrder(IdParam.parse(req.params.id)))
})

adminRouter.patch('/orders/:id/status', async (req, res) => {
  const id = IdParam.parse(req.params.id)
  const { status } = StatusPatchBody.parse(req.body)
  res.json(await changeStatus(id, status))
})

adminRouter.get('/stats', async (_req, res) => {
  res.json(await stats())
})

// ---------------------------------------------------------------- catalogue

adminRouter.get('/products', async (req, res) => {
  res.json(await listProductsAdmin(ProductListQueryAdmin.parse(req.query)))
})

adminRouter.get('/products/:id', async (req, res) => {
  res.json(await getProductAdmin(IdParam.parse(req.params.id)))
})

adminRouter.post('/products', async (req, res) => {
  res.status(201).json(await createProduct(ProductCreateBody.parse(req.body)))
})

// Retirement is `active: false` — the normal way to take a product down.
adminRouter.patch('/products/:id', async (req, res) => {
  res.json(await updateProduct(IdParam.parse(req.params.id), ProductUpdateBody.parse(req.body)))
})

// The ONLY delete path for a product. Guarded by order-line count; retirement
// via PATCH { active: false } remains the normal way to take something down.
adminRouter.delete('/products/:id', async (req, res) => {
  res.json(await deleteProduct(IdParam.parse(req.params.id)))
})

adminRouter.post('/products/:id/variants', async (req, res) => {
  const id = IdParam.parse(req.params.id)
  res.status(201).json(await createVariant(id, VariantCreateBody.parse(req.body)))
})

adminRouter.patch('/variants/:id', async (req, res) => {
  res.json(await updateVariant(IdParam.parse(req.params.id), VariantUpdateBody.parse(req.body)))
})

adminRouter.delete('/variants/:id', async (req, res) => {
  res.json(await deleteVariant(IdParam.parse(req.params.id)))
})

// Categories are shop sections (Nouveautés, Soldes, …) — never gendered.
adminRouter.get('/categories', async (_req, res) => {
  res.json(await listCategories())
})

adminRouter.post('/categories', async (req, res) => {
  res.status(201).json(await createCategory(CategoryBody.parse(req.body)))
})

adminRouter.patch('/categories/:id', async (req, res) => {
  res.json(await updateCategory(IdParam.parse(req.params.id), CategoryUpdateBody.parse(req.body)))
})

adminRouter.delete('/categories/:id', async (req, res) => {
  res.json(await deleteCategory(IdParam.parse(req.params.id)))
})

adminRouter.get('/product-types', async (_req, res) => {
  res.json(await listProductTypes())
})

// Created inline from the product form so the owner never loses their place.
adminRouter.post('/product-types', async (req, res) => {
  const { name } = ProductTypeCreateBody.parse(req.body)
  res.status(201).json(await createProductType(name))
})

// ------------------------------------------------------------ shipping rates

adminRouter.get('/shipping-rates', async (req, res) => {
  const { carrier } = RateListQuery.parse(req.query)
  res.json(await listRates(carrier))
})

// One shape for inline edit and bulk edit alike — the page just sends more rows.
adminRouter.put('/shipping-rates', async (req, res) => {
  res.json(await upsertRates(RateUpsertBody.parse(req.body)))
})

// Separate from price edits: changing which carrier a wilaya ships with is what
// checkout reads, so it is never a side effect of typing a number.
adminRouter.put('/shipping-rates/default', async (req, res) => {
  res.json(await setDefaultCarrier(SetDefaultBody.parse(req.body)))
})

adminRouter.delete('/shipping-rates/:id', async (req, res) => {
  res.json(await deleteRate(IdParam.parse(req.params.id)))
})

adminRouter.get('/stock', async (_req, res) => {
  res.json(await lowStock())
})

// ------------------------------------------------------------------ images

adminRouter.get('/settings', async (_req, res) => {
  res.json(await getSettings())
})

adminRouter.put('/settings', async (req, res) => {
  res.json(await updateSettings(SettingsUpdateBody.parse(req.body)))
})

// Hero images are not attached to any product, so they upload into their own
// bucket folder rather than a product one.
adminRouter.post('/storefront/image/sign', async (req, res) => {
  const { filename } = SignUploadBody.parse(req.body)
  res.json(await createSignedUpload('storefront', filename))
})

adminRouter.get('/storage/status', (_req, res) => {
  res.json({ configured: isStorageConfigured() })
})

// The browser uploads straight to Supabase with this URL, so image bytes never
// pass through this API and the service-role key stays server-side.
adminRouter.post('/products/:id/images/sign', async (req, res) => {
  const id = IdParam.parse(req.params.id)
  const { filename } = SignUploadBody.parse(req.body)
  res.json(await createSignedUpload(id, filename))
})

// Per-colour galleries. The legacy Product.images routes below still work and
// act as the shared fallback for products photographed before this existed.
adminRouter.get('/products/:id/photos', async (req, res) => {
  res.json(await listImages(IdParam.parse(req.params.id)))
})

adminRouter.post('/products/:id/photos', async (req, res) => {
  const id = IdParam.parse(req.params.id)
  const { path, color } = ImageAttachBody.parse(req.body)
  res.status(201).json(await addImage(id, path, color ?? null))
})

adminRouter.delete('/products/:id/photos', async (req, res) => {
  const id = IdParam.parse(req.params.id)
  const { imageId } = ImageDeleteBody.parse(req.body)
  res.json(await removeImage(id, imageId))
})

adminRouter.post('/products/:id/images', async (req, res) => {
  const id = IdParam.parse(req.params.id)
  const { path } = ImageAttachBody.parse(req.body)
  res.json(await attachImage(id, path))
})

adminRouter.delete('/products/:id/images', async (req, res) => {
  const id = IdParam.parse(req.params.id)
  const { url } = ImageDetachBody.parse(req.body)
  res.json(await detachImage(id, url))
})
