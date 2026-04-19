import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { config } from './config'
import { authenticateServiceAccount, checkPocketBaseHealth } from './plugins/pocketbase'
import errorHandlerPlugin from './plugins/error-handler'

// 导入路由
import publicOrderRoutes from './routes/public-orders'
import publicDishRoutes from './routes/public-dishes'
import publicTableStatusRoutes from './routes/public-table-status'

async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        config.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
  })

  // 全局中间件
  await app.register(helmet, {
    contentSecurityPolicy: false, // 前端静态资源需要
  })
  await app.register(cors, {
    origin: config.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
  })

  // 错误处理
  await app.register(errorHandlerPlugin)

  // 路由注册
  await app.register(publicOrderRoutes, { prefix: '/api/public/orders' })
  await app.register(publicDishRoutes, { prefix: '/api/public/dishes' })
  await app.register(publicTableStatusRoutes, { prefix: '/api/public/table-status' })

  // 健康检查
  app.get('/health', async (_request, reply) => {
    const pbHealthy = await checkPocketBaseHealth()
    return reply.code(pbHealthy ? 200 : 503).send({
      status: pbHealthy ? 'ok' : 'degraded',
      service: 'public-api',
      pocketbase: pbHealthy ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    })
  })

  return app
}

async function main() {
  try {
    // 1. 连接 PocketBase
    await authenticateServiceAccount()

    // 2. 构建应用
    const app = await buildApp()

    // 3. 启动服务
    await app.listen({
      port: config.PORT,
      host: config.HOST,
    })

    app.log.info(`🚀 公共API服务已启动: http://${config.HOST}:${config.PORT}`)
    app.log.info(`📋 环境: ${config.NODE_ENV}`)
    app.log.info(`🔗 PocketBase: ${config.PB_URL}`)
  } catch (err) {
    console.error('❌ 服务启动失败:', err)
    process.exit(1)
  }
}

// 启动
main()
