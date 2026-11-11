# ---- 构建阶段：Vite+ 镜像内含 Node 24 与 pnpm，产出无 node_modules 的自包含 bundle ----
FROM ghcr.io/voidzero-dev/vite-plus:1.3.0 AS build
WORKDIR /app

COPY --chown=vp:vp package.json pnpm-lock.yaml pnpm-workspace.yaml .node-version ./
COPY --chown=vp:vp apps/server/package.json apps/server/
COPY --chown=vp:vp apps/web/package.json apps/web/
COPY --chown=vp:vp packages/api/package.json packages/api/
COPY --chown=vp:vp packages/auth/package.json packages/auth/
COPY --chown=vp:vp packages/config/package.json packages/config/
COPY --chown=vp:vp packages/db/package.json packages/db/
COPY --chown=vp:vp packages/ui/package.json packages/ui/
RUN vp install --frozen-lockfile --filter "@handoverkit/server..." --filter "@handoverkit/web..."

COPY --chown=vp:vp . .
RUN vp run --filter "@handoverkit/server..." --filter "@handoverkit/web..." build

# ---- Node 运行时：Alpine Node 24，strip 后只保留二进制 ----
# node:24-alpine 当前基于 Alpine 3.24；如升级其中一个，需同步验证另一个。
FROM node:24-alpine AS node-runtime
RUN apk add --no-cache binutils \
  && cp /usr/local/bin/node /tmp/node \
  && chmod u+w /tmp/node \
  && strip --strip-all /tmp/node

# ---- 运行阶段：极小 Alpine + 精简 Node + 构建产物；SQLite 数据落在 /data 卷 ----
FROM alpine:3.24 AS runtime
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="易交接 HandoverKit" \
      org.opencontainers.image.description="医疗用物与交接记录系统（React + Hono + oRPC + SQLite）" \
      org.opencontainers.image.source="https://github.com/Eunsolfs/HandoverKit" \
      org.opencontainers.image.url="https://github.com/Eunsolfs/HandoverKit" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app

ENV NODE_ENV=production \
    PATH=/usr/local/bin:$PATH \
    PORT=3000 \
    DATABASE_URL=/data/app.db \
    TZ=Asia/Shanghai

# Node 运行时自带完整 ICU；tzdata 提供 TZ 解析；libstdc++/libgcc 是 Node 动态依赖。
RUN apk add --no-cache libstdc++ libgcc ca-certificates tzdata su-exec \
  && addgroup -S app \
  && adduser -S -G app app \
  && mkdir -p /data \
  && chown app:app /data

COPY --from=node-runtime /tmp/node /usr/local/bin/node

# dist/migrations 由 apps/server/vite.config.ts 的 pack.copy 从 packages/db 复制；
# dist/index.mjs 提供 /rpc、/api、/api/auth 与 SPA，dist/migrate.mjs 只做迁移。
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/web/dist ./dist/public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# 入口脚本先以 root 修正旧数据卷权限，再通过 su-exec 降权为 app。
USER root
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.mjs"]
