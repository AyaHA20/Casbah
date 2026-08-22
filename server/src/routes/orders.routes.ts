import { Router } from 'express'
import { CreateOrderBody } from '../schemas/order.schema.js'
import { createOrder } from '../services/orders.service.js'

export const ordersRouter = Router()

ordersRouter.post('/', async (req, res) => {
  const body = CreateOrderBody.parse(req.body)
  const order = await createOrder(body)
  res.status(201).json(order)
})
