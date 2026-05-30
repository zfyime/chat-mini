# syntax=docker/dockerfile:1.6

# ---------- builder: 安装依赖并构建 ----------
FROM node:20-alpine AS builder
WORKDIR /usr/src

RUN npm install -g pnpm@7

# 先拷依赖描述文件，最大化利用 layer 缓存
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# 再拷源码进行构建
COPY . .
RUN pnpm run build

# 生成仅含生产依赖的 node_modules，缩小最终镜像
RUN pnpm install --frozen-lockfile --prod && pnpm store prune

# ---------- runtime: 仅包含运行所需文件 ----------
FROM node:20-alpine AS runtime
WORKDIR /usr/src

ENV HOST=0.0.0.0 PORT=3000 NODE_ENV=production

COPY --from=builder /usr/src/node_modules ./node_modules
COPY --from=builder /usr/src/dist ./dist
COPY --from=builder /usr/src/hack ./
COPY package.json ./

EXPOSE 3000

CMD ["/bin/sh", "docker-entrypoint.sh"]
