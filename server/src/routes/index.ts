import { Router } from 'express'
import { healthRouter } from './health.routes.js'
import { ordersRouter } from './orders.routes.js'
import { productsRouter } from './products.routes.js'
import { wilayasRouter } from './wilayas.routes.js'

export const apiRouter = Router()

apiRouter.use('/health', healthRouter)
apiRouter.use('/products', productsRouter)
apiRouter.use('/wilayas', wilayasRouter)
apiRouter.use('/orders', ordersRouter)
