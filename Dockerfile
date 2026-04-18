# =============================================================================
# 智能点菜系统 - 前端生产镜像
# 多阶段构建：先构建 Vue 应用，再用 Nginx 托管静态资源
# =============================================================================

# ---- 构建阶段 ----
FROM node:22-alpine AS builder

WORKDIR /app

# 先复制依赖文件，利用 Docker 缓存层
COPY package*.json ./
RUN npm ci

# 复制源码并构建
COPY . .
RUN npm run build

# ---- 生产阶段 ----
FROM nginx:1.27-alpine

# 复制自定义 Nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 复制构建产物到 Nginx 默认目录
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
