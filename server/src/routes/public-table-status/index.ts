import { FastifyInstance } from 'fastify'
import { TableStatusService } from '../../services/table-status.service'

export default async function publicTableStatusRoutes(fastify: FastifyInstance) {
  // GET /api/public/table-status/:tableNo - 获取桌台状态
  fastify.get('/:tableNo', async (request, reply) => {
    const { tableNo } = request.params as { tableNo: string }
    const status = await TableStatusService.getByTableNo(tableNo)
    return reply.code(200).send({ status })
  })
}
