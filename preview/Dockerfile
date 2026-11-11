# statechart-kit preview（只读最新 SCXML/JSON + 仿真/Explorer）
#
# 构建（仓库根目录）：
#   docker build -f preview/Dockerfile -t statechart-preview .
#
# 运行：
#   docker run -d --name statechart-preview --restart unless-stopped \
#     -p 5182:5182 -v /opt/statechart-preview/data:/data:ro statechart-preview

FROM node:22-alpine AS build
ARG NPM_REGISTRY=
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi \
 && npm ci --no-audit --no-fund
COPY . .
RUN npx vite build --config preview/vite.config.ts

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=5182 \
    HOST=0.0.0.0 \
    DIST_DIR=/app/dist \
    DATA_DIR=/app/data
COPY --from=build --chown=node:node /app/preview/dist ./dist
COPY --chown=node:node preview/server.mjs ./
COPY --chown=node:node preview/data ./data
USER node
EXPOSE 5182
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["node", "server.mjs"]
