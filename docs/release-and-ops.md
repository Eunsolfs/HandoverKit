# 发布自动化与一键运维

> 目标：打一个 tag，GitHub Actions 自动跑质量门禁、构建镜像、创建 Release；服务器上用一条命令完成安装/升级/备份/恢复。

## 1. 发布流水线（GitHub Actions）

工作流文件：[.github/workflows/release.yml](../.github/workflows/release.yml)

```text
git tag v1.0.0 && git push origin v1.0.0
        │
        ▼
┌─────────────────┐   ┌──────────────────┐   ┌─────────────────────────┐
│ quality 质量门禁 │ → │ publish-image     │ → │ release 发布资产         │
│ check/knip/test │   │ 构建并推送 GHCR   │   │ GitHub Release + assets │
└─────────────────┘   └──────────────────┘   └─────────────────────────┘
```

- **触发**：push tag（`v*`）；或在 Actions 页面手动运行（填写已存在的 tag，可选 amd64/arm64）。
- **质量门禁**：`vp check`（格式/lint/类型）、`knip`、`vp test`（69 个集成测试）全部通过才继续。
- **镜像**：多阶段 Dockerfile 构建，推送到 `ghcr.io/<owner>/handoverkit`，标签为 tag 名、语义版本与 latest；附带 SBOM 与 provenance。
- **Release 资产**：
  - `handoverkit-ops.sh`：一键安装/运维脚本（脚本内默认镜像 tag 固定为本次发布版本）
  - `docker-compose.yml`：生产 Compose（直接拉镜像，不含 build）
  - `env.example`：环境变量模板
  - `DEPLOY.md`：本文档
  - `handoverkit-deploy-<tag>.tar.gz`：以上文件打包
  - `checksums.txt`：SHA256

### 首次发布前检查

1. 仓库 Settings → Actions → General → Workflow permissions：允许 workflow 写仓库内容（Release）。
2. GHCR 包可见性：v1.0.0 起已设为 **public**，安装服务器可直接匿名拉取。若后续改为私有，需要：
   - 在服务器 `docker login ghcr.io -u <GitHub用户名>`（PAT 勾选 `read:packages`）；
   - 或重新把 package 设为 public。
3. 本仓库默认构建 `linux/amd64`；需要 ARM 服务器时在手动运行里选 `linux/amd64,linux/arm64`（取决于基础镜像是否支持 arm64）。

## 2. 一键安装（推荐）

服务器要求：Linux、Docker 24+、Docker Compose v2、能访问 `ghcr.io` 与 `github.com`。

```bash
curl -fsSL https://github.com/Eunsolfs/HandoverKit/releases/latest/download/handoverkit-ops.sh -o /tmp/ops.sh
sudo bash /tmp/ops.sh install
```

交互式安装会询问（直接回车即用默认值）：

| 问题               | 默认值                 | 说明                                                        |
| ------------------ | ---------------------- | ----------------------------------------------------------- |
| 对外访问地址       | `http://<本机IP>:8080` | 必须与浏览器实际访问地址一致；HTTPS 反代时填 `https://域名` |
| 宿主机端口         | `8080`                 | 反向代理指向 `http://127.0.0.1:8080`                        |
| 超级管理员初始密码 | 自动生成               | 登录后请立即修改                                            |

安装脚本会：

1. 生成 `/opt/handoverkit/.env`（含随机密钥，权限 600）与 `docker-compose.yml`；
2. 拉取镜像 → 执行数据库迁移 → 启动应用；
3. 健康检查通过后输出访问地址、管理员账号与常用运维命令。

数据保存在 Docker 卷 `handoverkit_data`（容器内 `/data/app.db`），重建容器不丢数据。

### 非交互安装（自动化）

```bash
sudo HK_DIR=/opt/handoverkit \
  HK_URL=https://handover.example.com \
  HK_PORT=8080 \
  SEED_ADMIN_PASSWORD='请换成强密码' \
  bash /tmp/ops.sh install
```

> `BETTER_AUTH_URL`（即 HK_URL）必须与用户浏览器地址完全一致，否则登录会被 Better Auth 的 Origin 校验拒绝（403）。反代改了域名/协议后要同步修改并重启。

### 安装后使用 1Panel 反向代理 + HTTPS

详细步骤见 [1Panel 部署手册](deployment-1panel.md)。

1. 1Panel → 网站 → 反向代理，指向 `http://127.0.0.1:8080`；
2. 申请/上传证书并开启 HTTPS；
3. 把 `/opt/handoverkit/.env` 中 `BETTER_AUTH_URL` 改为 `https://你的域名`；
4. 修改 env 后必须**重建容器**（`ops.sh restart` 不会重新读取 env）：

```bash
cd /opt/handoverkit
sudo docker compose --env-file .env up -d --force-recreate app
```

## 3. 运维命令

脚本安装后会复制到 `/opt/handoverkit/ops.sh`（也可继续用下载的 /tmp/ops.sh）。

| 命令                              | 作用                                                          |
| --------------------------------- | ------------------------------------------------------------- |
| `sudo bash ops.sh install`        | 安装/修复启动（已存在 .env 则复用）                           |
| `sudo bash ops.sh upgrade [tag]`  | 升级镜像（默认 latest）；**升级前自动备份**，失败给出回滚命令 |
| `sudo bash ops.sh rollback`       | 回滚到上一次升级前的镜像（使用 `.env.bak`）                   |
| `sudo bash ops.sh status`         | 容器状态 + 健康检查 + 当前镜像/访问地址/数据卷                |
| `sudo bash ops.sh logs`           | 跟踪应用日志                                                  |
| `sudo bash ops.sh backup [备注]`  | 在线备份 SQLite（WAL checkpoint）+ .env 到 `backups/`         |
| `sudo bash ops.sh restore <文件>` | 从备份恢复（二次确认，恢复前自动备份）                        |
| `sudo bash ops.sh restart`        | 重启并等待健康检查                                            |
| `sudo bash ops.sh doctor`         | 检查 Docker/Compose/配置环境                                  |
| `sudo bash ops.sh uninstall`      | 停止并移除容器（数据卷和目录可选删除）                        |
| `sudo bash ops.sh menu`           | 交互式菜单（无参数时默认）                                    |

### 升级与回滚

```bash
sudo bash /opt/handoverkit/ops.sh upgrade v1.0.0
# 失败时：
sudo bash /opt/handoverkit/ops.sh rollback
```

升级流程：备份 → 更新 .env 中 `HK_IMAGE` → 拉镜像 → 重新执行迁移 → 启动 → 健康检查。配置与数据库都在宿主机目录/卷中，升级不会丢失。

### 备份与恢复

```bash
sudo bash /opt/handoverkit/ops.sh backup manual
# 输出：/opt/handoverkit/backups/handoverkit-20260101-120000-manual.tar.gz
sudo bash /opt/handoverkit/ops.sh restore /opt/handoverkit/backups/handoverkit-20260101-120000-manual.tar.gz
```

备份包含 `app.db` 与 `.env`（含密钥，请妥善保管）。建议配合 1Panel 计划任务或 `cron` 每天备份并异地保存。

## 4. 手动 Compose / 1Panel 编排部署

不使用一键脚本时：

```bash
# 从 Release 下载以下文件到同一目录
# docker-compose.yml  env.example  handoverkit-ops.sh
cp env.example .env
# 编辑 .env：HK_IMAGE / APP_PORT / BETTER_AUTH_URL / BETTER_AUTH_SECRET / SEED_ADMIN_*
docker compose pull
docker compose up -d
```

1Panel：容器 → 编排 → 创建编排，粘贴 `docker-compose.yml`，在界面或同目录 `.env` 填变量，启动即可。

## 5. 网络受限 / 私有仓库 / 离线安装

- **GHCR 慢或不可达**：在有网机器 `docker pull` 后 `docker save` 传到服务器 `docker load`，把 `.env` 的 `HK_IMAGE` 改为本地镜像名，再执行 `ops.sh install`（脚本仍会 compose pull，本地已存在则很快）。
- **镜像加速**：把 `HK_IMAGE` 换成自己的 registry 地址；升级时 `ops.sh upgrade <完整镜像地址>`。
- **内网完全离线**：用 Release 里的 Compose + 导出的镜像 tar 部署，镜像部署完成后不依赖 GitHub。

## 6. 安全与注意事项

- `.env` 含会话密钥与初始密码：权限 600，不要提交 Git，不要随镜像分发。
- 首次登录后立即修改管理员密码；建议关闭不用的账号。
- 反向代理/HTTPS 时确保 `BETTER_AUTH_URL` 与外部地址一致；代理需透传 Host 与 X-Forwarded-For。
- 数据库是 SQLite（单写入）：不要多副本同时挂载同一数据卷；多实例请改 PostgreSQL。
- 验证码存储在进程内存，重启后失效属正常；当前部署为单实例。
- 生产建议：定期备份、限制 22/8080 端口来源、在 1Panel 配置防火墙与 HTTPS。

## 7. 常见问题

| 现象                                   | 处理                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `docker compose pull` 401/unauthorized | 镜像已 public；先 `docker logout ghcr.io` 再重试；若包被改回私有，执行 `docker login ghcr.io`（PAT `read:packages`）      |
| 登录 403 / Origin 不一致               | `.env` 的 `BETTER_AUTH_URL` 与实际访问地址不一致；修改后 `docker compose up -d --force-recreate app`                      |
| 健康检查失败                           | `ops.sh logs` 查看；常见为端口占用、数据库权限（/data 需可写）、迁移失败                                                  |
| 端口被占用                             | 修改 `.env` 的 `APP_PORT` 后 `ops.sh restart`                                                                             |
| 备份失败：应用未运行                   | 先 `ops.sh status`，确保 app 容器在运行                                                                                   |
| 升级后想回退                           | `ops.sh rollback`（保留上一次 .env 镜像配置）                                                                             |
| 忘记管理员密码                         | 用 `docker compose exec app node ...` 重置较复杂；可用备份恢复或联系维护者（当前未提供 CLI 改密，可在登录后个人中心修改） |

## 8. 实测记录（Docker Desktop）

已在 Docker Desktop 4.97 / Engine 29.9.2 / Compose v5.6.1（Windows，Linux 容器）实测：

- `docker build -t handoverkit:local .`：多阶段构建成功（镜像约 296 MB / 压缩 77 MB）。
- `docker compose -f deploy/docker-compose.release.yml --env-file deploy/env.release.example config`：通过。
- Release Compose 直接部署：migrate → app → `/api/health` 200、`/login` 200。
- `ops.sh install`（本地镜像）：自动配置、迁移、启动、健康检查通过；登录 `admin` 成功、`me.get` 正常。
- `ops.sh status / backup / restore / upgrade / rollback / uninstall`：全部实测通过，备份包含 `app.db` 与 `.env`。
- 离线/本地镜像：`docker compose pull` 失败时，`ops.sh` 会自动检测本地已有镜像并继续（无需联网）。
- 自动化场景可设置 `HK_YES=1` 自动确认 restore / uninstall 等操作（请谨慎使用）。

> 注：Windows 上用 Git Bash 执行 Docker 命令时，需把 Docker Desktop 的 `resources\bin` 加入 PATH；否则会出现 `docker-credential-desktop` 找不到或路径转换问题（详见 docs/pitfalls.md）。

## 9. 本地验证脚本（不依赖 Docker）

```bash
HK_DIR=$PWD/.tmp-ops HK_DRY_RUN=1 HK_PORT=8099 HK_URL=http://127.0.0.1:8099 \
  bash scripts/ops.sh install
# 只生成 .env 与 docker-compose.yml，不拉镜像/不启动
```

> 提示：本仓库的 `ops.sh` 与 Release 资产是同一份文件；修改后随下一个 tag 自动生效。
