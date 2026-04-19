# =============================================================================
# 智能点菜系统 - 公共API服务镜像
# 多阶段构建：先编译 TypeScript，再运行生产构建
# =============================================================================

# ---- 构建阶段 ----
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build

# ---- 生产阶段 ----
FROM node:22-alpine

WORKDIR /app

# 安装 PM2（生产进程管理）
RUN npm install -g pm2

# 复制生产依赖和编译产物
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/ecosystem.config.js ./

# 非 root 用户运行
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000

CMD ["pm2-runtime", "start", "ecosystem.config.js"]
