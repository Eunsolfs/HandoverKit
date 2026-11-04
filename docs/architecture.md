# 易交接 —— 架构设计

> 目标：单机可部署（1Panel/Docker）、类型安全的端到端全栈、易扩展多团队与多交接事项。

## 1. 技术栈

| 层          | 选型                                                 | 说明                                                    |
| ----------- | ---------------------------------------------------- | ------------------------------------------------------- |
| 构建/工具链 | Vite+（vp）                                          | 统一 dev/build/test/lint/format                         |
| 前端        | React 19 + TanStack Router + TanStack Query          | SPA，文件路由，按角色守卫                               |
| UI          | Tailwind CSS v4 + shadcn/ui（Base UI）+ lucide-react | 复制式组件，主题用 CSS 变量                             |
| API         | oRPC（RPC + OpenAPI）                                | 端到端类型推导，无需 codegen                            |
| 后端        | Hono on Node 24                                      | /api/auth（Better Auth）、/rpc（oRPC）、/api（OpenAPI） |
| 认证        | Better Auth（username 插件）                         | 会话 Cookie、scrypt 密码；禁用自助注册                  |
| 数据库      | SQLite（WAL）+ Drizzle ORM                           | 单文件数据库，Drizzle 迁移；Docker 数据卷 /data         |
| 部署        | Docker Compose                                       | migrate 一次性任务 + app 常驻；1Panel 可建 Compose 应用 |

## 2. 目录与职责

```text
apps/web         React SPA（路由、页面、组件、样式、E2E）
apps/server      Hono 入口（env、db/auth 实例、验证码与登录路由、静态资源）
packages/api     oRPC routers、鉴权中间件、DTO 映射、集成测试
packages/auth    Better Auth 配置、账号创建/改密、图形验证码
packages/db      Drizzle schema、relations、迁移、测试数据库工厂
packages/ui      shadcn 组件与全局样式
packages/config  TypeScript 预设
docs             需求、数据模型、API 契约、开发规划、设计系统、部署、避坑
scripts          演示种子、运维脚本
```

## 3. 请求链路

```text
浏览器 ──GET  /api/captcha─────────────► Hono（内存验证码）
       ──POST /api/login───────────────► Hono 校验验证码 + 限流
                                          └─► auth.api.signInUsername（Better Auth）
       ──POST /rpc/<ns>/<proc>─────────► Hono /rpc → oRPC RPCHandler
                                          └─► protectedProcedure（实时读取 user）
                                             └─► 团队隔离 / 角色守卫
                                                └─► Drizzle（同步 SQLite）
       ──GET  /api/auth/get-session────► Better Auth
生产环境：Hono 同时托管 dist/public 静态资源，单端口同源，无 CORS；
开发环境：Vite 代理 /api 与 /rpc 到 :3000。
```

## 4. 安全模型

1. **认证**：用户名 + 密码（Better Auth scrypt），会话 HttpOnly Cookie；不存在公开注册入口（emailAndPassword.disableSignUp）。
2. **验证码**：登录前必须通过服务端 SVG 图形验证码；一次性、5 分钟过期、错误 3 次失效；按 IP 5 分钟 10 次失败限流。
3. **授权**：每个请求从数据库实时读取用户 role/teamId/status（停用立即失效）；三层 procedure：protected / admin / superAdmin；业务查询强制团队过滤，越权返回 NOT_FOUND。
4. **团队隔离**：matter 是团队级资源；item/record/usage/movement/exception 均挂在 matter 下，由 assertMatterAccess 统一校验。
5. **二维码**：matter.qrToken 为高熵不可猜测串；扫码页仍需登录并校验属于该团队；管理员可手动轮换 token 使旧码失效。管理员可选择子仓库生成携带 `?subWarehouseId=` 的二维码，扫码页据此直接进入该子仓库；不携带时默认第一个启用子仓库。
6. **审计**：库存流水不可变；记录保存操作人姓名快照；撤销审批留痕。
7. **输入校验**：所有 procedure 入参用 Zod；数据库约束（CHECK/UNIQUE/FK）兜底关键不变量（库存非负、状态枚举、日期格式）。
8. **生产配置**：BETTER_AUTH_SECRET 必须为 32+ 随机串；BETTER_AUTH_URL 必须与浏览器访问的 origin 完全一致（反代需传递 Host/Origin）。

## 5. 数据一致性与事务

- SQLite 使用 WAL；写操作串行。
- 同步驱动：事务回调内使用 .run()/.all()/.get()，不 await。
- 关键事务：
  - 消耗登记：校验库存 → 条件扣减 → 写 usage/usage_item → 写 consumption 流水。
  - 撤销审批：校验 pending → 恢复库存 → 写 revoke 流水 → 记录置 revoked。
  - 接班验收/交班：状态机校验 + 清单快照更新 + 差异自动生成异常。
- 交接记录按 (matterId, recordDate) 唯一，幂等生成。

## 6. 可扩展性

| 需求                  | 扩展点                                                                             |
| --------------------- | ---------------------------------------------------------------------------------- |
| 新增报表              | packages/api/src/routers/stats.ts 增加 procedure；前端统计页加模块                 |
| 新增物品属性          | 迁移新增列（保留快照字段兼容历史）；DTO 扩展                                       |
| 通知（低库存/待审批） | 服务端定时任务 + 通知表；或 1Panel 外部告警                                        |
| 多语言                | 引入 i18n 资源包，替换页面文案                                                     |
| 多实例部署            | 将 SQLite 换 PostgreSQL（Drizzle 仅改 db 实例与 schema 类型）；验证码/限流改 Redis |

## 7. 运行与部署

- 开发：vp run dev（web:5173 + server:3000；Vite 代理）。
- 构建：vp run -r build → apps/server/dist（含迁移）与 apps/web/dist（静态资源）。
- 容器：build 阶段用 vite-plus 镜像；runtime 仅 Node + dist，非 root 用户，/data 挂载 SQLite。
- 迁移：compose 的 migrate 服务在 app 启动前执行；升级只需重建镜像并 up -d。
- 备份：复制 /data/app.db（WAL 模式需先 checkpoint：sqlite3 app.db 'PRAGMA wal_checkpoint(TRUNCATE);' 或停服复制）。

## 8. 质量门禁

- vp check：oxlint（含 anti-slop）+ TypeScript + 格式。
- vp test：单元/集成（进程内真实 DB、真实会话）。
- vp run test:e2e：Playwright 真实浏览器闭环。
- vp run ready：上述 + knip + build，提交前全绿。
