import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { OrderService } from '../../services/order.service'

const createOrderSchema = z.object({
  tableNo: z.string().min(1).max(20),
  guests: z.number().int().min(1).max(100).default(1),
  items: z.array(
    z.object({
      dishId: z.string().min(1),
      name: z.string().min(1),
      price: z.number().positive(),
      quantity: z.number().positive(),
      remark: z.string().optional(),
    }),
  ).min(1),
  cutlery: z.object({
    type: z.enum(['free', 'charged']),
    quantity: z.number().int().min(0),
  }).optional().nullable(),
  customerPhone: z.string().optional(),
})

const appendItemsSchema = z.object({
  items: z.array(
    z.object({
      dishId: z.string().min(1),
      name: z.string().min(1),
      price: z.number().positive(),
      quantity: z.number().positive(),
      remark: z.string().optional(),
    }),
  ).min(1),
})

export default async function publicOrderRoutes(fastify: FastifyInstance) {
  // POST /api/public/orders - 创建订单
  fastify.post('/', async (request, reply) => {
    const data = createOrderSchema.parse(request.body)
    const result = await OrderService.create(data)
    return reply.code(201).send(result)
  })

  // GET /api/public/orders/by-table/:tableNo - 按桌号查询当前订单
  fastify.get('/by-table/:tableNo', async (request, reply) => {
    const { tableNo } = request.params as { tableNo: string }
    const order = await OrderService.getByTableNo(tableNo)
    if (!order) {
      return reply.code(200).send({ order: null })
    }
    return reply.code(200).send({ order })
  })

  // GET /api/public/orders/:id?token=xxx - 获取订单详情
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { token } = request.query as { token?: string }

    if (!token) {
      return reply.code(401).send({ error: '缺少访问令牌' })
    }

    const order = await OrderService.getById(id, token)
    return reply.code(200).send({ order })
  })

  // PATCH /api/public/orders/:id/items?token=xxx - 追加菜品
  fastify.patch('/:id/items', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { token } = request.query as { token?: string }
    const { items } = appendItemsSchema.parse(request.body)

    if (!token) {
      return reply.code(401).send({ error: '缺少访问令牌' })
    }

    const result = await OrderService.appendItems(id, token, items)
    return reply.code(200).send({ order: result })
  })
}
