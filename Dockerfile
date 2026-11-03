# syntax=docker/dockerfile:1

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
RUN cp "$(vp env which node | head -1)" /tmp/node

# ---- 运行阶段：仅 Node + 构建产物；SQLite 数据落在 /data 卷 ----
FROM debian:trixie-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=/data/app.db \
    TZ=Asia/Shanghai

# Node 运行时自带完整 ICU；TZ 依赖 Debian 基础镜像自带的 tzdata（Priority: required）。
COPY --from=build /tmp/node /usr/local/bin/node

# dist/migrations 由 apps/server/vite.config.ts 的 pack.copy 从 packages/db 复制；
# dist/index.mjs 提供 /rpc、/api、/api/auth 与 SPA，dist/migrate.mjs 只做迁移。
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/web/dist ./dist/public

RUN mkdir -p /data && chown nobody:nogroup /data

USER nobody
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "dist/index.mjs"]
