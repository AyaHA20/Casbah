import { Router } from 'express'
import { requireAdmin } from '../middleware/require-admin.js'
import { IdParam, LoginBody, OrderListQuery, StatusPatchBody } from '../schemas/admin.schema.js'
import { login } from '../services/admin-auth.service.js'
import { changeStatus, getOrder, listOrders, stats } from '../services/admin-orders.service.js'

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
