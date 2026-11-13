# statechart-kit preview（只读最新 SCXML/JSON + 仿真/Explorer）
#
# 构建（仓库根目录）：
#   docker build -f preview/Dockerfile -t statechart-preview .
#
# 运行：
#   docker run -d --name statechart-preview --restart unless-stopped \
#     -p 5182:5182 -v /opt/statechart-preview/data:/data:ro statechart-preview

ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS build
ARG NPM_REGISTRY=
WORKDIR /app
COPY --chown=1000:1000 package*.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi \
 && npm ci --include=dev --no-audit --no-fund
COPY --chown=1000:1000 . .
RUN chmod -R a+rX . && npx vite build --config preview/vite.config.ts

FROM ${NODE_IMAGE}
WORKDIR /app
ENV NODE_ENV=production \
    PORT=5182 \
    HOST=0.0.0.0 \
    DIST_DIR=/app/dist \
    DATA_DIR=/app/data
COPY --from=build --chown=1000:1000 /app/preview/dist ./dist
COPY --chown=1000:1000 preview/server.mjs ./
COPY --chown=1000:1000 preview/data ./data
USER 1000
EXPOSE 5182
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT []
CMD ["node", "server.mjs"]
