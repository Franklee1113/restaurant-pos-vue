import dotenv from 'dotenv'
import { z } from 'zod'
import path from 'node:path'

// 加载 .env 文件（从项目根目录加载，与前端共享配置）
dotenv.config({ path: path.resolve(process.cwd(), '../.env') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const configSchema = z.object({
  PB_URL: z.string().default('http://127.0.0.1:8090'),
  PB_ADMIN_EMAIL: z.string().email(),
  PB_ADMIN_PASSWORD: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('127.0.0.1'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  CORS_ORIGIN: z.string().default('*'),
})

const parsed = configSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ 配置验证失败:', parsed.error.format())
  process.exit(1)
}

export const config = parsed.data
