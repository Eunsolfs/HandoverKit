# 更新日志

## v0.1.0（开发中）

### M5 — 部署与验收（2026-11-03）

- Dockerfile：多阶段构建、非 root、/data 数据卷、TZ=Asia/Shanghai、/api/health 健康检查、迁移随包。
- docker-compose：migrate 一次性任务 + app、命名卷、健康检查、日志轮转、环境变量模板。
- 1Panel 部署文档：Compose 创建、反向代理/HTTPS、SQLite 备份恢复、升级回滚、常见问题。
- 演示种子脚本（幂等，团队/事项/物品/历史记录/待审批撤销/异常）与账号说明。
- Playwright E2E：登录（验证码错误/成功登录/退出）、扫码三功能与交接全链路。
- 生产构建冒烟与 vp run ready 全绿：check / knip / 57 integration / 3 e2e / build。

### M4 — 前端业务页面（2026-11-03）

- 工作台：真实指标（交接事项/待接收/已交班/今日用物）、今日交接状态、快捷操作、无团队引导。
- 交接记录：按日/周/月/年 + 事项/状态筛选、分页；详情含清单核对、接班/交班、当日消耗、异常、撤销申请；接班核对/交班表弹窗（逐项勾选 + 实盘 + 差异备注）。
- 用物消耗：日期范围/事项/状态筛选、登记对话框（仓库选物、多行明细、患者字段、操作员）、撤销申请、待审批标记。
- 扫码页（移动优先）：接班核对 / 用物消耗登记 / 交班表三页签，未登录回跳、底部固定主按钮、状态只读态。
- 管理端：团队、用户、交接事项与二维码（PNG/SVG 下载、打印、申请变更）、物品库存（入库/盘点调整/流水）、统计（周/月/年趋势 + 排行 + 明细 + 预警）。
- 角色化导航、团队切换、用户菜单、深浅色、空/加载/错误态；Base UI 菜单崩溃修复。

### M3 — 前端外壳与登录（2026-11-03）

- teal/emerald 设计令牌（浅/深色、图表色、success/warning/info）、中文字体回退、克制动效。
- 登录页：品牌区 + 图形验证码（点击刷新、失败换码）+ 内联错误 + 站内 redirect。
- 应用外壳：248px 侧边栏、顶栏、角色化导航、超管团队切换、用户菜单（改密/退出）、主题切换、移动端抽屉。
- 共享组件与页面骨架；生产构建移除调试工具。

### M2 — 后端业务 API（2026-11-03）

- 40 个 oRPC procedure：teams/users/matters/items/records/usage/exceptions/stats（+ me 重构）。
- DTO 映射、团队时区日期工具、DTO loaders、当日记录幂等生成。
- 集成测试 9 个文件 / 57 用例：权限矩阵、团队隔离、库存原子扣减与回滚、验收/交班状态机、撤销审批、统计口径。
- 契约补充：驳回撤销恢复 active、物品删除拦截交接快照、统计包含 revoke_pending。

### M1 — 契约与认证基座（2026-11-03）

- 需求规格、数据模型、API 契约、架构、设计系统、开发规划、避坑记录。
- Drizzle 领域表：team / matter / item / stock_movement / handover_record / handover_record_item / usage_record / usage_item / revoke_request / exception_event。
- Better Auth username 登录（禁用自助注册）+ 图形验证码 + 登录失败限流。
- 种子超级管理员（首次启动）、账号创建/改密辅助函数。
- oRPC 基座：实时用户资料、角色守卫、团队隔离辅助、me.get/changePassword。

### M0 — 基线（2026-11-03）

- VibeStart 生成全栈脚手架（Vite+ / React / TanStack Router / Hono / oRPC / SQLite / Drizzle / Better Auth / shadcn / Docker / Playwright）。
- 依赖安装、初始迁移、开发与构建链路打通。
