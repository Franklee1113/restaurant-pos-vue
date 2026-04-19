import { FastifyInstance, FastifyError } from 'fastify'
import { ZodError } from 'zod'
import { AppError } from '../utils/errors'

export default async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler((error: FastifyError | Error, _request, reply) => {
    // Zod 校验错误
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: '请求参数校验失败',
        details: error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      })
    }

    // 业务错误
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: error.message,
        code: error.code,
      })
    }

    // Fastify 验证错误（如参数类型不匹配）
    if ('validation' in error && error.validation) {
      return reply.code(400).send({
        error: '请求格式错误',
        message: error.message,
      })
    }

    // 未知错误（生产环境不暴露堆栈）
    fastify.log.error(error)
    return reply.code(500).send({
      error: process.env.NODE_ENV === 'production'
        ? '服务器内部错误'
        : error.message,
    })
  })
}
