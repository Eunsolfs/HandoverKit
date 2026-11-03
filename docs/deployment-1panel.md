> **推荐**：如果使用 GitHub Release 提供的镜像，可直接看 [发布自动化与一键运维](release-and-ops.md)，用 `handoverkit-ops.sh install` 一条命令完成安装；本文保留手动 Compose / 1Panel 编排与源码构建的完整步骤。

# 易交接 —— 1Panel / Docker Compose 部署手册

> 适用版本：HandoverKit v1（M5）。目标环境：单机 1Panel（Docker + Compose）、SQLite。
> 全部命令可直接复制；`$PUBLIC_URL`、`$APP_DIR` 等占位符按实际值替换。

## 1. 部署结构

```text
浏览器 ──HTTPS──▶ 1Panel 反向代理（OpenResty） ──HTTP──▶ 127.0.0.1:${APP_PORT}
                                                        │
                                              ┌─────────┴─────────┐
                                              │ app 容器          │  dist/index.mjs
                                              │  3000 端口         │  /rpc /api /api/auth + SPA
                                              └─────────┬─────────┘
                                                        │
                                              ┌─────────┴─────────┐
                                              │ migrate 容器      │  dist/migrate.mjs（一次性）
                                              └─────────┬─────────┘
                                                        │
                                              ┌─────────┴─────────┐
                                              │ data 命名卷       │  /data/app.db（SQLite）
                                              └───────────────────┘
```

要点：

- **一个镜像、两个入口**：`migrate` 先执行数据库迁移并退出，`app` 等它成功后再启动；升级时迁移自动执行。
- **单实例**：SQLite 同一时间只允许一个写入者，`app` 只跑 1 个副本，不要用 `--scale` 扩容。
- **数据持久化**：数据库固定为 `/data/app.db`，挂在 `data` 命名卷上。`docker compose down` 不会删数据；`down -v` 会。
- **镜像不含 node_modules**：依赖已打进 bundle，运行阶段只有 Node 与 `dist/`。

镜像内固定值（`Dockerfile`）：`NODE_ENV=production`、`DATABASE_URL=/data/app.db`、`TZ=Asia/Shanghai`、非 root 用户 `nobody`、`/api/health` 健康检查。

## 2. 服务器准备

| 项目 | 要求                                                          |
| ---- | ------------------------------------------------------------- |
| 系统 | 1Panel v2（含 Docker / Docker Compose 插件），Linux x86_64    |
| 配置 | 1 核 1 GB 起；磁盘 ≥ 5 GB（镜像约 200 MB，其余留给数据/日志） |
| 网络 | 80/443 对外开放（HTTPS 由 1Panel 申请证书）；3000 不对外暴露  |
| 软件 | 无需安装 Node、pnpm；仅用 Docker 与 1Panel 面板               |

1Panel 面板中确认「容器」→「编排」可用、已安装 OpenResty（网站反向代理需要）。

### 2.1 上传代码

任选一种方式，把仓库放到 1Panel 的目录，例如 `/opt/1panel/apps/handoverkit`：

```bash
# 方式 A：服务器有外网，直接 clone
mkdir -p /opt/1panel/apps && cd /opt/1panel/apps
git clone <仓库地址> handoverkit && cd handoverkit

# 方式 B：本地打包上传后在 1Panel「主机 → 文件」解压
# 本地执行（在仓库根）：
tar --exclude=node_modules --exclude=.git --exclude=dist -czf handoverkit.tar.gz .
# 上传到 /opt/1panel/apps/handoverkit 后解压：
tar -xzf handoverkit.tar.gz
```

只需要仓库源码；`node_modules`、`dist`、`apps/server/local.db` 都不需要上传（已排除）。

### 2.2 准备 .env

```bash
cd /opt/1panel/apps/handoverkit
cp .env.example .env
# 生成 32+ 字符密钥并写入 BETTER_AUTH_SECRET（Linux 自带 openssl）
SECRET=$(openssl rand -base64 32)
sed -i "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$SECRET|" .env

# 按实际域名/端口修改 BETTER_AUTH_URL 与 APP_PORT
vi .env
```

生产 `.env` 示例（务必替换域名与密钥）：

```dotenv
BETTER_AUTH_SECRET=<openssl rand -base64 32 的输出>
BETTER_AUTH_URL=https://handover.example.com
APP_PORT=3000
TZ=Asia/Shanghai
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=<首次登录用的强密码>
SEED_ADMIN_NAME=系统管理员
APP_VERSION=latest
```

**`BETTER_AUTH_URL` 必须是浏览器最终访问的完整地址**（协议 + 域名 + 端口，不带结尾斜杠）。Better Auth 用它做 Origin 校验并决定 Cookie 的 `Secure` 属性：

- 用 HTTPS 访问却填 `http://...` → 登录被 403 拒绝；
- 反过来访问 `http://IP:3000` 却填 `https://域名` → Cookie 不生效、一直跳回登录页。

修改 `.env` 后需要重启 app：`docker compose up -d`（会重建容器）。

## 3. 在 1Panel 创建 Compose 应用

### 3.1 面板方式（推荐）

1. 打开「容器」→「编排」→「创建编排」。
2. 名称填 `handoverkit`，来源选「本地」，把仓库根目录的 `docker-compose.yml` 全文粘贴进去。
3. 若面板提供「环境变量 / .env」输入框，把 2.2 中 `.env` 的内容粘贴进去（同一项目下 `.env` 文件也生效）。
4. 确认「工作目录 / 项目目录」（即代码所在目录，包含 Dockerfile 与 .env），点击「确认 / 部署」。
5. 首次部署选择「构建」：1Panel 会执行 `docker compose up -d --build`，构建约 2–5 分钟（取决于拉取 Vite+ 基础镜像的速度）。

> 不同 1Panel 版本的入口名称略有差异：旧版为「容器 → 编排」，部分版本在「应用 → 本地应用」。只要最终能执行标准 `docker compose` 即可。

### 3.2 SSH 方式

面板不可用时直接在服务器执行：

```bash
cd /opt/1panel/apps/handoverkit
docker compose config          # 语法自检：应展开出 migrate/app 两个服务
docker compose up -d --build   # 构建并启动；migrate 成功后 app 才启动
docker compose ps              # migrate 应为 exited(0)，app 为 running(healthy)
docker compose logs -f app     # 看到 "Server listening on http://localhost:3000" 即成功
```

### 3.3 首次初始化

1. 等到 `app` 健康检查变成 `healthy`：`docker compose ps`。
2. 打开 `BETTER_AUTH_URL` / 或临时用 `http://服务器IP:${APP_PORT}` 访问。
3. 用 `.env` 中的 `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`（默认 `admin` / `Admin@123456`）登录，输入图形验证码。
4. **登录后立即在右上角用户菜单修改密码**。种子账号只在数据库没有任何超级管理员时创建一次，之后修改 `.env` 不会改已有账号密码。

## 4. 反向代理与 HTTPS

### 4.1 创建反向代理网站

1. 打开「网站」→「创建网站」→「反向代理」。
2. 主域名填 `handover.example.com`，代理地址填 `http://127.0.0.1:3000`（即 `APP_PORT`）。
3. 保存后访问 http://域名 验证可达，再申请证书。

等价的 OpenResty 配置（1Panel 会自动写类似配置，供对照）：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
}
```

> 请求体最大几 MB 即可（系统只接收 JSON，无文件上传）。二维码 PNG 由浏览器生成下载，不经过服务端。

### 4.2 申请 HTTPS 证书

1. 「网站」→ 该站点「配置」→「HTTPS」→「申请证书」（Let's Encrypt，需 80 端口可访问、域名已解析）。
2. 开启「强制 HTTPS」。
3. 确认 `.env` 的 `BETTER_AUTH_URL=https://handover.example.com`，然后：

```bash
cd /opt/1panel/apps/handoverkit
docker compose up -d    # 应用新的 BETTER_AUTH_URL
```

4. 重新登录验证：Cookie 带 `Secure` 属性，登录后刷新仍是登录态。

### 4.3 登录限流与代理 IP

登录失败限流按客户端 IP 计数：优先读 `X-Forwarded-For` / `X-Real-IP`，没有则回退到连接地址。因此反向代理必须保留上面两个头（1Panel 默认会转发）。

当前版本没有为 Better Auth 配置 `advanced.ipAddress`，Better Auth 自身的限流可能把整台反代当成同一个 IP。单机小规模部署可接受；如需精确到用户，请让开发在 `packages/auth` 中把 `advanced.ipAddress.headers` 配置为 `["x-forwarded-for"]` 后重新构建。

## 5. 数据备份与恢复（SQLite）

数据只有一处：命名卷 `data` 中的 `/data/app.db`（WAL 模式下还有 `app.db-wal` / `app.db-shm`）。

```bash
# 查看数据卷真实路径（通常是 /var/lib/docker/volumes/handoverkit_data/_data）
# 若 1Panel 的编排项目名不是 handoverkit，先 docker volume ls | grep handoverkit 找实际卷名
docker volume inspect handoverkit_data --format '{{ .Mountpoint }}'
```

### 5.1 热备份（推荐，服务不停）

在宿主机安装 sqlite3（`apt install -y sqlite3`），用 SQLite 的在线备份命令复制，WAL 中的事务也会包含进去：

```bash
cd /opt/1panel/apps/handoverkit
mkdir -p backups
DB_PATH=$(docker volume inspect handoverkit_data --format '{{ .Mountpoint }}')
sqlite3 "$DB_PATH/app.db" ".backup 'backups/app-$(date +%F-%H%M).db'"
ls -lh backups
```

定期执行可放到 1Panel「计划任务」→「Shell 脚本」，每天凌晨跑上面的命令；也可以额外用 1Panel 的「计划任务 → 备份目录」备份 `backups/`。

### 5.2 冷备份（最稳，短暂停机）

```bash
cd /opt/1panel/apps/handoverkit
docker compose stop app migrate
docker run --rm -v handoverkit_data:/data -v "$PWD/backups:/backup" alpine \
  tar -czf /backup/data-$(date +%F-%H%M).tar.gz -C /data .
docker compose up -d          # 如需补跑迁移，先执行 docker compose run --rm migrate
```

### 5.3 恢复

1. 停止应用（保留数据卷）：

```bash
cd /opt/1panel/apps/handoverkit
docker compose down            # 不要加 -v，否则会删除数据卷
```

2. 把备份写回数据卷，并把所有者改回容器内的 `nobody`（UID 65534），否则应用启动后无法写库：

```bash
DB_PATH=$(docker volume inspect handoverkit_data --format '{{ .Mountpoint }}')
# 热备份（.db 文件）：
sudo cp backups/app-2026-11-03-1200.db "$DB_PATH/app.db"
sudo rm -f "$DB_PATH/app.db-wal" "$DB_PATH/app.db-shm"

# 或冷备份（tar.gz）：
# docker run --rm -v handoverkit_data:/data -v "$PWD/backups:/backup" alpine \
#   sh -c 'rm -rf /data/* && tar -xzf /backup/data-2026-11-03-1200.tar.gz -C /data'

sudo chown -R 65534:65534 "$DB_PATH"
```

3. 重新启动并验证：

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

迁移服务会对恢复出来的旧库执行增量迁移；恢复后先确认能登录、能看到备份时间点的数据。

## 6. 升级流程

```bash
cd /opt/1panel/apps/handoverkit
# 1) 先备份（见第 5 节）
# 2) 更新代码（git pull 或重新上传解压）
git pull
# 3) 重新构建并滚动替换；migrate 会先跑完迁移，app 才启动
docker compose build
docker compose up -d
# 4) 观察
docker compose ps
docker compose logs --tail=100 app
```

回滚镜像（迁移已执行、数据已变更时需配合数据库备份回滚）：

```bash
# 构建时若设置了 APP_VERSION 标签，可保留旧镜像用于回滚
docker images | grep handoverkit
# 旧版示例：APP_VERSION=1.0.0 docker compose up -d
```

**升级注意**：

- 不要执行 `docker compose down -v`（`-v` 删数据卷）。
- 已提交的迁移只增不改；迁移失败时 app 不会启动，先看 `docker compose logs migrate`。
- 升级后若登录态异常，先检查 `BETTER_AUTH_URL` 是否随域名/协议变化；改动后重启 app。

## 7. 日志与排查

```bash
cd /opt/1panel/apps/handoverkit

docker compose ps                     # 容器状态与健康检查
docker compose logs -f app            # 应用日志（含 Hono 访问日志、seed 提示）
docker compose logs --tail=200 migrate # 迁移日志
docker inspect --format '{{json .State.Health}}' $(docker compose ps -q app) | python3 -m json.tool

# 健康检查（应返回 200 {"status":"ok",...}）
curl -i http://127.0.0.1:3000/api/health
```

日志已配置 `json-file` 轮转（每文件 10 MB，最多 3 个），不会无限增长。

### 常见问题

| 现象                                       | 原因                                                                    | 处理                                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 登录页能打开，提交后提示「请求失败」或 403 | `BETTER_AUTH_URL` 与浏览器地址的协议/域名/端口不一致（Origin 校验失败） | 改成浏览器实际地址（`https://域名`），`docker compose up -d` 重启 app，清 Cookie 后重试                       |
| 登录成功却立刻跳回登录页                   | HTTPS 站点的 Cookie 是 Secure，但用 http 访问；或反代未转发 Host        | 用 `BETTER_AUTH_URL` 的地址访问；检查反代 `proxy_set_header Host $host`                                       |
| app 一直 `starting` / 重启循环             | `migrate` 失败（app 等它成功）；或 `BETTER_AUTH_SECRET` < 32 字符       | `docker compose logs migrate`；用 `openssl rand -base64 32` 重新生成                                          |
| 启动报 `EACCES` / `SQLITE_CANTOPEN`        | 数据卷目录不属于容器用户 `nobody`(65534)，常见于恢复文件或宿主目录挂载  | 见 5.3：`chown -R 65534:65534`；或重新创建数据卷（会丢数据，先备份）                                          |
| `port is already allocated`                | `APP_PORT` 与 1Panel 其他应用冲突                                       | 改 `.env` 的 `APP_PORT`，如 3010，然后 `docker compose up -d`；反代同步改端口                                 |
| 反代 502 Bad Gateway                       | app 未 healthy / 端口填错 / 只监听了容器内网                            | `docker compose ps` 确认 healthy；`curl 127.0.0.1:${APP_PORT}/api/health`；反代地址用 `127.0.0.1:${APP_PORT}` |
| 验证码总是错误                             | 验证码存于进程内存：重启 app、跑多副本、或多台机器负载均衡都会丢失校验  | 单实例部署；登录页点击验证码刷新后再输入                                                                      |
| 所有用户突然掉登录                         | 换了 `BETTER_AUTH_SECRET`（会话令牌随之失效）                           | 属预期，重新登录；密钥一旦上线不要随意更换                                                                    |
| 数据库 `SQLITE_BUSY`                       | 同时跑了多个 app 副本或备份时大量写入                                   | 只保留 1 个 app 副本；备份用 5.1 的 `.backup`                                                                 |
| 时间显示比本地早 8 小时                    | 容器时区                                                                | `.env` 保持 `TZ=Asia/Shanghai`；团队时区默认 Asia/Shanghai                                                    |
| 修改域名后后台正常、浏览器异常             | 旧 Cookie/缓存                                                          | 清站点 Cookie；确认反代与 `BETTER_AUTH_URL` 完全一致                                                          |

排查顺序：`docker compose ps` → `logs migrate` → `logs app` → `curl /api/health` → 反代配置 → `.env` 地址。

## 8. 演示数据

演示数据只用于展示/培训，**不要写进正式生产库**。`scripts/seed-demo.ts` 依赖仓库内的 TypeScript 源码与开发依赖，不在运行镜像里（镜像只含 `dist/`），因此要在**有 Node 24 与仓库代码的机器**上执行：

```bash
# 在仓库根目录（本地开发机或服务器上的代码目录，需先 pnpm install）
node scripts/seed-demo.ts
# 或
pnpm run seed:demo
```

脚本读取 `apps/server/.env` 的 `DATABASE_URL`（默认 `apps/server/local.db`），幂等：重复执行会重建「示范院区」下的演示数据，不影响其他团队。

演示账号（仅演示环境）：

| 角色       | 登录名      | 密码           |
| ---------- | ----------- | -------------- |
| 团队管理员 | `teamadmin` | `Team@123456`  |
| 普通成员   | `nurse`     | `Nurse@123456` |

演示数据包含：团队「示范院区」（编码 `DEMO`）、两个交接事项（固定二维码 token）、13 个物品与初始库存流水、4 条历史已交班记录、5 条消耗记录（含患者信息）、1 条待审批撤销申请、1 条未解决异常事件。

### 8.1 把演示库带到 1Panel（可选）

1. 在本地仓库执行 `node scripts/seed-demo.ts`，得到含演示数据的 `apps/server/local.db`（WAL 模式下同时存在 `local.db-wal`；正常关闭进程后 WAL 会合并，必要时用 `sqlite3 local.db "PRAGMA wal_checkpoint(TRUNCATE);"`）。
2. 在 1Panel 上**首次启动前**把该文件放进数据卷（先 `docker compose down`，再按 5.3 的步骤写入并 `chown 65534:65534`），然后 `docker compose up -d`。
3. 演示结束后清空数据卷并重新部署，回到干净库。

> 也可以把演示环境单独建一个 Compose 项目（不同项目名/端口/数据卷），与正式环境隔离。

## 9. 部署验收清单

```bash
cd /opt/1panel/apps/handoverkit

docker compose config >/dev/null && echo "compose OK"
docker compose ps                          # app = running (healthy)，migrate = exited (0)
curl -fsS http://127.0.0.1:${APP_PORT}/api/health && echo " health OK"
curl -fsS -o /dev/null -w "%{http_code}\n" https://<域名>/login   # 200

# 登录闭环：浏览器打开 https://<域名>/login，用超级管理员登录 → 进入工作台 → 退出登录
# 然后在「用户管理」创建团队、用户、交接事项，扫码进入三个页签验证
```

交付判定：健康检查 200、登录闭环通过、迁移日志无报错、数据卷持久化（重启后数据仍在）、备份文件可恢复。

## 10. 与开发环境的关系

| 项目       | 开发（`vp run dev`）         | 生产（Compose）                     |
| ---------- | ---------------------------- | ----------------------------------- |
| 浏览器地址 | http://localhost:5173        | `BETTER_AUTH_URL`                   |
| 前端       | Vite dev server（5173）      | 服务端静态托管 `dist/public`        |
| API        | 3000（Vite 代理 /rpc、/api） | 同源容器内 3000，反代对外           |
| 数据库     | `apps/server/local.db`       | `/data/app.db`（data 卷）           |
| 环境变量   | `apps/server/.env`           | 根目录 `.env` + Compose environment |
| 迁移       | `vp run db:migrate`          | `migrate` 服务自动执行              |
