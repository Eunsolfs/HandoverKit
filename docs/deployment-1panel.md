# 易交接 v1.0.0 —— 1Panel 部署手册

> 适用版本：**HandoverKit v1.0.0**（稳定版）  
> 目标环境：单机 1Panel v2、Linux x86_64、Docker + Compose、SQLite  
> 推荐方式：GitHub Release 一键安装脚本；镜像已公开发布在 GHCR。

- Release：https://github.com/Eunsolfs/HandoverKit/releases/tag/v1.0.0
- 镜像：`ghcr.io/eunsolfs/handoverkit:v1.0.0`
- 一键脚本：`handoverkit-ops.sh`

---

## 1. 部署结构

```text
浏览器 ──HTTPS──▶ 1Panel OpenResty 反代 ──HTTP──▶ 127.0.0.1:8080
                                                   │
                                         ┌─────────┴─────────┐
                                         │ app 容器          │
                                         │ 容器内 3000        │
                                         │ /rpc /api + SPA   │
                                         └─────────┬─────────┘
                                                   │
                                         ┌─────────┴─────────┐
                                         │ migrate 容器      │
                                         │ 迁移后退出         │
                                         └─────────┬─────────┘
                                                   │
                                         ┌─────────┴─────────┐
                                         │ Docker 卷         │
                                         │ /data/app.db      │
                                         └───────────────────┘
```

要点：

- 一个镜像、两个入口：`migrate` 先迁移，成功后 `app` 才启动。
- SQLite 单写入：只运行 **1 个 app 副本**，不要横向扩容。
- 数据卷固定为 `handoverkit_data`；不要执行 `docker compose down -v`。
- 应用必须部署在域名根路径，不支持 `/handover` 子路径。

---

## 2. 前置条件

| 项目 | 要求                                             |
| ---- | ------------------------------------------------ |
| 系统 | Linux x86_64；1Panel v2，Docker / Compose 可用   |
| 配置 | 1 核 1 GB 起；磁盘 ≥ 5 GB                        |
| 网络 | 80 / 443 对公网开放；8080 不对公网开放           |
| 域名 | 已解析到服务器公网 IP，如 `handover.example.com` |
| 权限 | SSH root 或 sudo                                 |

1Panel 中确认已安装 OpenResty（用于反向代理和 HTTPS）。

---

## 3. 一键安装（推荐）

SSH 登录服务器：

```bash
curl -fsSL https://github.com/Eunsolfs/HandoverKit/releases/latest/download/handoverkit-ops.sh -o /tmp/ops.sh
sudo bash /tmp/ops.sh install
```

交互提示：

| 提示               | 建议填写                       |
| ------------------ | ------------------------------ |
| 对外访问地址       | `https://handover.example.com` |
| 宿主机端口         | `8080`                         |
| 超级管理员初始密码 | 强密码，或留空自动生成         |

安装完成后会输出访问地址、管理员账号和密码。请立即保存。

### 非交互安装

```bash
sudo bash -c 'HK_URL="https://handover.example.com" HK_PORT=8080 SEED_ADMIN_PASSWORD="换成强密码" bash /tmp/ops.sh install'
```

### 安装结果

```text
/opt/handoverkit/
├── .env
├── docker-compose.yml
├── ops.sh
└── backups/
```

验证：

```bash
sudo bash /opt/handoverkit/ops.sh status
curl -s http://127.0.0.1:8080/api/health
```

---

## 4. 1Panel 反向代理与 HTTPS

### 4.1 创建反向代理

1Panel：

1. 网站 → 创建网站 → 反向代理
2. 域名：`handover.example.com`
3. 代理地址：`http://127.0.0.1:8080`
4. 保存

> 如果 1Panel 的 OpenResty 容器无法访问宿主机 `127.0.0.1:8080`，改用服务器内网 IP，如 `http://192.168.1.10:8080`。

1Panel 默认会设置：

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

请确认不要删除这些头。

### 4.2 申请证书

网站 → 站点配置 → HTTPS → Let's Encrypt 申请证书 → 开启强制 HTTPS。

### 4.3 地址必须一致

`BETTER_AUTH_URL` 必须与浏览器最终地址完全一致。修改：

```bash
cd /opt/handoverkit
sudo sed -i 's|^BETTER_AUTH_URL=.*|BETTER_AUTH_URL="https://handover.example.com"|' .env
```

**必须重建容器**，修改 env 后 `restart` 不会重新读取：

```bash
cd /opt/handoverkit
sudo docker compose --env-file .env up -d --force-recreate app
```

验证：

```bash
curl -s http://127.0.0.1:8080/api/health
curl -s -o /dev/null -w '%{http_code}\n' https://handover.example.com/login
```

---

## 5. 首次初始化

1. 打开 `https://handover.example.com`
2. 用 `admin` + 安装密码登录，输入图形验证码
3. 右上角用户菜单修改密码
4. 团队管理 → 创建团队
5. 交接事项 → 创建事项（系统自动创建“主仓库”）
6. 事项二维码页 → 子仓库 → 新建门诊 / 住院等子仓库
7. 物品库存 → 选择事项和子仓库 → 新建物品 / 入库
8. 手机扫码 → 选择子仓库 → 接班核对 → 用物登记 → 交班表

建议上线前完整走一遍「扫码 + 三个页签」流程。

---

## 6. 1Panel 图形界面 Compose 方式（可选）

不使用 SSH 一键脚本时：

1. 从 Release 下载：
   - `docker-compose.yml`
   - `env.example`

2. 在 1Panel「主机 → 文件」创建：

```text
/opt/1panel/apps/handoverkit
```

3. 上传两个文件，把 `env.example` 改名为 `.env`。

4. 编辑 `.env`：

```dotenv
HK_IMAGE=ghcr.io/eunsolfs/handoverkit:v1.0.0
APP_PORT=8080
BETTER_AUTH_URL=https://handover.example.com
BETTER_AUTH_SECRET=<openssl rand -hex 32 生成>
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=<强密码>
SEED_ADMIN_NAME=系统管理员
TZ=Asia/Shanghai
```

生成密钥：

```bash
openssl rand -hex 32
```

5. 1Panel → 容器 → 编排 → 创建编排
6. 名称：`handoverkit`
7. 目录：`/opt/1panel/apps/handoverkit`
8. 粘贴 `docker-compose.yml`，部署。

> 图形方式没有自动备份、升级、回滚，生产环境仍建议使用 `ops.sh`。

---

## 7. 防火墙与安全

- 公网只开放 80 / 443。
- 8080 只允许本机/内网，不要暴露公网。
- 1Panel 防火墙和云厂商安全组都要限制 8080。
- 首次登录后立即修改管理员密码。
- 不要提交 `.env`，不要分享含密钥的备份。
- 建议关闭不用的账号，定期检查用户管理。

---

## 8. 日常运维

```bash
# 状态 / 健康检查
sudo bash /opt/handoverkit/ops.sh status

# 日志
sudo bash /opt/handoverkit/ops.sh logs

# 手动备份
sudo bash /opt/handoverkit/ops.sh backup manual

# 升级（自动备份，可回滚）
sudo bash /opt/handoverkit/ops.sh upgrade

# 指定版本
sudo bash /opt/handoverkit/ops.sh upgrade v1.0.0

# 回滚
sudo bash /opt/handoverkit/ops.sh rollback

# 重启
sudo bash /opt/handoverkit/ops.sh restart
```

### 1Panel 定时备份

1Panel → 计划任务 → Shell 脚本，每天执行：

```bash
cd /opt/handoverkit && ./ops.sh backup daily
```

再通过 1Panel 计划任务或对象存储把 `/opt/handoverkit/backups` 同步到异地。

### 数据位置

```text
Docker 卷：handoverkit_data
容器内：  /data/app.db
```

不要执行 `docker compose down -v`。

---

## 9. 常见问题

| 现象                            | 处理                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| 登录 403 / 登录后跳回登录页     | 检查 `.env` 的 `BETTER_AUTH_URL` 是否与浏览器地址完全一致；修改后 `up -d --force-recreate app` |
| 1Panel 反代 502                 | `curl -i http://127.0.0.1:8080/api/health`；确认 app healthy、代理端口正确                     |
| 镜像拉取 401                    | 镜像已 public；执行 `docker logout ghcr.io` 后重试；仍失败检查服务器能否访问 ghcr.io           |
| HTTPS 证书失败                  | 域名解析、80 端口、1Panel 站点配置                                                             |
| 启动报 SQLITE_CANTOPEN / EACCES | 数据卷权限应为 `65534:65534`；不要手工挂载宿主机目录                                           |
| 端口被占用                      | 修改 `.env` 的 `APP_PORT`，重建 app，并同步反代                                                |
| 修改域名后异常                  | 改 `BETTER_AUTH_URL` 并重建容器；清站点 Cookie                                                 |
| 数据丢失                        | 不要 `down -v`；从 `/opt/handoverkit/backups` 恢复                                             |
| 多实例                          | 不支持；SQLite 单写入，只运行一个 app                                                          |

排查顺序：

```bash
sudo bash /opt/handoverkit/ops.sh status
sudo bash /opt/handoverkit/ops.sh logs
curl -i http://127.0.0.1:8080/api/health
```

---

## 10. 上线验收清单

- [ ] `curl http://127.0.0.1:8080/api/health` 返回 200
- [ ] `https://域名/login` 可访问
- [ ] admin 登录成功
- [ ] 已修改管理员密码
- [ ] 已创建团队 / 事项 / 子仓库 / 物品
- [ ] 手机可扫码并切换子仓库
- [ ] 接班核对 → 用物登记 → 交班表完整走通
- [ ] 1Panel 反代与 HTTPS 正常
- [ ] 8080 未暴露公网
- [ ] `ops.sh backup` 成功，并已配置每日备份
- [ ] 容器重启后数据仍在

---

## 11. 演示数据（仅演示环境）

演示数据不会随 v1.0.0 发布，正式库默认为空，只创建初始管理员。

需要演示时，在开发机生成演示库后导入，或在开发环境执行：

```bash
pnpm run seed:demo
```

演示账号：`teamadmin / Team@123456`、`nurse / Nurse@123456`。  
**不要在生产库执行演示数据脚本。**

---

## 12. 相关文档

- [发布与一键运维](release-and-ops.md)
- [需求规格](requirements.md)
- [数据模型](data-model.md)
- [API 契约](api-contract.md)
- [避坑记录](pitfalls.md)
