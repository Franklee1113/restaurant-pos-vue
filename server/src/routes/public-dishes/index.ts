import { FastifyInstance } from 'fastify'
import { DishService } from '../../services/dish.service'

export default async function publicDishRoutes(fastify: FastifyInstance) {
  // GET /api/public/dishes - 获取所有菜品
  fastify.get('/', async (_request, reply) => {
    const dishes = await DishService.getAll()
    return reply.code(200).send({ items: dishes })
  })
}
