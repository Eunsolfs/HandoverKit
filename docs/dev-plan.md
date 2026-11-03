# 易交接 —— 开发规划与分工

> 本文是里程碑、任务分解与文件所有权的依据。并行开发时严格遵守「写作用域」，避免同一文件被多人同时修改。

## 1. 里程碑

| 里程碑            | 内容                                                                                        | 验收标准                                                 | 状态 |
| ----------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---- |
| M0 基线           | VibeStart 脚手架、依赖安装、SQLite 迁移、开发/构建链路                                      | `vp run dev` 正常；`vp run db:migrate` 成功；基线 commit | ✅   |
| M1 契约与认证基座 | 需求/数据模型/API 文档；Drizzle 业务表；Better Auth 用户名登录 + 图形验证码；种子超级管理员 | 可登录拿到会话；验证码错误被拒绝；迁移生成               | ✅   |
| M2 后端业务 API   | teams/users/matters/items/records/usage/exceptions/stats 全部 procedure + 集成测试          | 集成测试覆盖鉴权/团队隔离/库存事务/撤销审批              | ✅   |
| M3 前端外壳与登录 | 设计令牌、登录页（验证码）、应用外壳（侧边栏/顶栏/团队切换/深浅色）、共享组件               | 登录 → 工作台闭环；375px 可用；深浅色正常                | ✅   |
| M4 前端业务页面   | 工作台、交接记录、用物消耗、物品库存、统计、事项/二维码、用户、团队、扫码三功能             | 每个角色主流程可完成；空/加载/错误态完备                 | ✅   |
| M5 部署与验收     | Docker/1Panel 文档、README、E2E、构建产物、避坑记录、版本提交                               | `vp run ready` 通过；compose 可启动；文档完整            | ✅   |

## 2. 并行分工与写作用域

| 角色               | 负责                                                                   | 写作用域（相对仓库根）                                                                                                                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lead**           | 契约、数据模型、认证基座、集成、评审、文档、git 提交                   | `docs/**`、`README.md`、`CHANGELOG.md`、`packages/db/src/schema/handover.ts`、`packages/auth/**`、`apps/server/src/{app,env,context,seed}.ts`、`packages/api/src/{procedures,authz,context}.ts`                                                                                                    |
| **backend-api**    | 全部业务 oRPC routers、集成测试、统计 SQL                              | `packages/api/src/routers/**`、`packages/api/tests/**`                                                                                                                                                                                                                                             |
| **frontend-core**  | 设计系统、登录页、应用外壳、工作台、交接记录页、用物消耗页、扫码三功能 | `apps/web/src/routes/{__root,login,_app,_app.index}.tsx`、`apps/web/src/routes/_app/records/**`、`apps/web/src/routes/_app/usage/**`、`apps/web/src/routes/_app/scan/**`、`apps/web/src/routes/scan/**`、`apps/web/src/components/**`、`apps/web/src/lib/**`、`packages/ui/src/styles/globals.css` |
| **frontend-admin** | 管理端页面：团队、用户、事项与二维码、物品库存、统计                   | `apps/web/src/routes/_app/{teams,users,matters,items,stats}/**`、`apps/web/src/features/admin/**`                                                                                                                                                                                                  |
| **qa-deploy**      | Docker/1Panel 部署、README 部署章节、E2E、种子演示数据、构建验收       | `Dockerfile`、`docker-compose.yml`、`.env.example`、`docs/deployment-1panel.md`、`apps/web/tests/**`、`scripts/**`                                                                                                                                                                                 |

**冲突规避**：

1. `packages/api/src/index.ts`（路由注册）与 `packages/api/src/routers/` 由 backend-api 独占；Lead 只做最终 review。
2. 共享组件由 frontend-core 先落地（`apps/web/src/components/app/**`），frontend-admin 只读引用；如需修改先在任务里说明。
3. `routeTree.gen.ts` 由 TanStack Router 插件自动生成，任何人不要手改。
4. 迁移文件由 Lead 生成并提交；backend-api 不新增迁移（如需改表，先通知 Lead）。

## 3. 任务拆解（执行顺序）

### M1（Lead）

1. 文档：requirements / data-model / api-contract / dev-plan / design-system / pitfalls。
2. `packages/db/src/schema/handover.ts` + 扩展 `auth.ts` 用户字段 + relations。
3. `packages/auth`：username 插件、禁用自助注册、验证码存储与校验、登录限流。
4. `apps/server`：`/api/captcha`、`/api/login`、种子管理员、env 扩展。
5. `packages/api`：context 扩展（实时用户）、procedures 分层（protected/admin/superAdmin）、团队作用域辅助。
6. 生成迁移、手工验证登录、提交 M1。

### M2（backend-api）

- 按 api-contract.md 实现 8 个 router + DTO 映射。
- 每个 procedure 的校验、错误码、团队隔离；库存事务；撤销审批；统计聚合。
- 集成测试：`packages/api/tests/integration/`，覆盖：
  - 未登录/普通用户/团队管理员/超级管理员权限矩阵
  - 跨团队越权 → NOT_FOUND
  - 库存不足拒单、并发扣减不为负
  - 验收必须全勾选、交班状态机
  - 撤销审批恢复库存、重复审批冲突
  - 统计口径（排除 revoked）

### M3（frontend-core）

- 设计令牌（teal/emerald、浅/深色、字体回退、圆角、阴影、动效克制）。
- `AppShell`：桌面侧边栏 + 移动端抽屉；角色化导航；团队切换（超级管理员）；用户菜单；主题切换。
- 登录页：品牌区 + 验证码 `/api/captcha` + 错误提示 + redirect 回跳。
- 共享组件：PageHeader、StatCard、StatusBadge、EmptyState、ConfirmDialog、DataTable/Pagination、DateRangeFilter、Money/Qty 展示、Loading skeleton。
- 路由骨架 + 守卫（未登录跳登录；角色不足显示 403 面板）。
- 工作台、交接记录列表/详情、用物消耗列表/登记、扫码页三页签。

### M4（frontend-admin）

- 团队管理（超级管理员）、用户管理、交接事项 + 二维码下载/打印/变更、物品库存 + 入库/调整、统计页（周/月/年切换 + 图表 + 明细表）。
- 与前端 core 共享组件，不重复造轮子。

### M5（qa-deploy）

- Dockerfile/compose 完善：健康检查、数据卷、迁移服务、非 root、时区。
- 1Panel 部署文档：Compose 应用创建、环境变量、反向代理 HTTPS、备份恢复、升级流程。
- 演示种子数据脚本（团队/事项/物品/用户/历史记录）。
- Playwright E2E：登录验证码（测试环境可注入固定验证码）、接班 → 消耗 → 交班 → 撤销审批全链路。
- 最终验收：`vp run ready`（check + knip + test + e2e + build）。

## 4. 风险与对策

| 风险                                 | 对策                                                           |
| ------------------------------------ | -------------------------------------------------------------- |
| 多 agent 同时改同一文件冲突          | 严格写作用域；共享组件先落地；Lead 统一提交前 review diff      |
| oRPC 类型与前端不同步                | API 契约先行；前端只从 `@handoverkit/api` 导入类型；CI 跑 tsc  |
| Better Auth 用户名插件与验证码集成   | 自定义 `/api/login` 路由统一校验，前端不直连 sign-in 接口      |
| 库存并发                             | 事务 + 条件更新 `WHERE stock >= qty`；SQLite WAL               |
| 二维码泄露                           | token 128-bit 随机；变更即失效；扫码页仍要求登录               |
| 1Panel 部署差异                      | 提供标准 Compose + 环境变量模板 + 备份脚本；文档覆盖反代/HTTPS |
| Windows 本地工具链（Node/pnpm 版本） | 统一使用文档中的 bundled Node 24 + pnpm 12 命令；CI 用 Docker  |

## 5. 完成定义（DoD）

- 代码通过 `vp check`（type/lint/format）与 `vp test`；E2E 通过。
- 每个 procedure 有权限与错误分支测试；前端有空/加载/错误态。
- 文档同步：API 契约、README、避坑记录、CHANGELOG。
- 每次里程碑一个 git commit（本地，不推远端）。
