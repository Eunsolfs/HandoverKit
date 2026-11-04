# 易交接 —— API 契约（v1）

> 类型由 oRPC 端到端推导：前端通过 `@handoverkit/api` 的 `AppRouter` 获得完整类型，不需要 codegen。
> **命名空间与 procedure 名是冻结契约**；新增字段可以，改名/删除必须同步更新本文件与前端。

## 1. 认证与验证码（HTTP 路由，非 oRPC）

| 方法 | 路径                    | 说明                                                                                                                                                                                                   |
| ---- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET  | `/api/captcha`          | 生成图形验证码。响应 `{ id: string, svg: string }`，`Cache-Control: no-store`；有效期 5 分钟，一次性                                                                                                   |
| POST | `/api/login`            | 登录。Body `{ username, password, captchaId, captchaAnswer }`。成功 `200 { ok: true, user: ProfileDto }` 并 Set-Cookie；失败 `400` 验证码错误 / `401` 账号或密码错误 / `403` 账号停用 / `429` 尝试过多 |
| POST | `/api/auth/sign-out`    | Better Auth 退出登录（前端用 authClient.signOut）                                                                                                                                                      |
| GET  | `/api/auth/get-session` | Better Auth 会话（前端 authClient.getSession）                                                                                                                                                         |

实现要点：

- 登录名大小写不敏感；服务端校验验证码后调用 `auth.api.signInUsername`。
- 登录失败信息不泄露账号是否存在（统一「登录名或密码错误」）。
- 验证码内存存储（单实例部署），按 IP 限流：5 次/分钟。

## 2. 通用约定

- 传输：`POST /rpc/<namespace>.<procedure>`（oRPC RPC Handler）。
- 鉴权：会话 Cookie；`protectedProcedure` 校验登录且账号为 active。
- 团队隔离：普通用户/团队管理员只能访问自己团队；超级管理员通过可选参数 `teamId` 指定，缺省用其「当前团队」（服务端取第一个团队）。
- 错误：`ORPCError(code, { message })`，message 为可直接展示的中文。
  - `UNAUTHORIZED` 未登录/会话失效/账号停用
  - `FORBIDDEN` 角色不足
  - `NOT_FOUND` 资源不存在或不属于当前团队（不泄露存在性）
  - `BAD_REQUEST` 参数/业务校验失败
  - `CONFLICT` 唯一性、状态冲突、库存不足、审批冲突
- 日期：`YYYY-MM-DD`；时间戳：Unix 毫秒。
- 分页：`{ page: number (1-based), pageSize: number (10-100) }` → `{ items: T[], total: number, page, pageSize }`。

## 3. DTO

```ts
type Role = "super_admin" | "team_admin" | "member";
type TeamStatus = "active" | "archived";
type RecordStatus = "pending_acceptance" | "accepted" | "handover_submitted";
type UsageStatus = "active" | "revoke_pending" | "revoked";

interface ProfileDto {
  id: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  teamId: string | null;
  teamName: string | null;
  phone: string | null;
  status: "active" | "disabled";
}

interface TeamDto {
  id: string;
  name: string;
  code: string;
  description: string | null;
  timezone: string;
  status: TeamStatus;
  memberCount: number;
  matterCount: number;
  createdAt: number;
}

interface MatterDto {
  id: string;
  teamId: string;
  teamName: string;
  name: string;
  code: string | null;
  description: string | null;
  status: "active" | "archived";
  qrToken: string;
  qrVersion: number;
  qrChangedAt: number | null;
  itemCount: number;
  todayStatus: RecordStatus | null;
  createdAt: number;
}

interface SubWarehouseDto {
  id: string;
  matterId: string;
  name: string;
  code: string | null;
  location: string | null;
  description: string | null;
  status: "active" | "archived";
  sortOrder: number;
  itemCount: number;
  totalStock: number;
  createdAt: number;
}

interface ItemDto {
  id: string;
  matterId: string;
  subWarehouseId: string;
  subWarehouseName: string;
  name: string;
  spec: string | null;
  unit: string;
  category: string | null;
  stock: number;
  minStock: number;
  location: string | null;
  note: string | null;
  status: "active" | "archived";
  lowStock: boolean;
  createdAt: number;
}

interface RecordItemDto {
  itemId: string;
  itemName: string;
  itemSpec: string | null;
  unit: string;
  expectedQty: number;
  checked: boolean;
  actualQty: number | null;
  note: string | null;
  acceptedAt: number | null;
  handoverChecked: boolean;
  handoverActualQty: number | null;
  handoverNote: string | null;
}

interface RecordSummaryDto {
  id: string;
  matterId: string;
  matterName: string;
  subWarehouseId: string;
  subWarehouseName: string;
  recordDate: string;
  status: RecordStatus;
  acceptedByName: string | null;
  acceptedAt: number | null;
  handoverByName: string | null;
  handoverAt: number | null;
  itemCount: number;
  diffCount: number;
  usageCount: number;
}

interface RecordDetailDto extends RecordSummaryDto {
  acceptanceNote: string | null;
  handoverNote: string | null;
  items: RecordItemDto[];
  usages: UsageDto[];
  exceptions: ExceptionDto[];
  revokeRequests: RevokeRequestDto[];
  permissions: {
    canAccept: boolean;
    canHandover: boolean;
    canDelete: boolean;
    /** 验收存在数量差异且尚未提交异常上报 */
    requiresExceptionReport: boolean;
    /** 已接班且无未上报差异，允许登记用物 */
    canRegisterUsage: boolean;
  };
}

interface UsageItemDto {
  itemId: string;
  itemName: string;
  sourceSubWarehouseName: string;
  itemSpec: string | null;
  unit: string;
  quantity: number;
}

interface UsageDto {
  id: string;
  matterId: string;
  matterName: string;
  subWarehouseId: string;
  subWarehouseName: string;
  recordId: string | null;
  usedAt: string;
  usedAtTime: string | null;
  isBackfill: boolean;
  backfillReason: string | null;
  patientName: string;
  patientType: "outpatient" | "inpatient";
  patientNo: string;
  patientPhone: string | null;
  operatorName: string;
  note: string | null;
  status: UsageStatus;
  items: UsageItemDto[];
  totalQuantity: number;
  revokeRequest: RevokeRequestDto | null;
  createdAt: number;
}

interface RevokeRequestDto {
  id: string;
  usageId: string;
  status: "pending" | "approved" | "rejected";
  reason: string;
  requestedByName: string;
  requestedAt: number;
  reviewedByName: string | null;
  reviewedAt: number | null;
  reviewNote: string | null;
}

interface ExceptionDto {
  id: string;
  matterId: string;
  matterName: string;
  recordId: string | null;
  itemId: string | null;
  type: "missing" | "damaged" | "count_mismatch" | "other";
  severity: "low" | "medium" | "high";
  description: string;
  status: "open" | "resolved";
  reportedByName: string;
  reportedAt: number;
  resolvedByName: string | null;
  resolvedAt: number | null;
  resolution: string | null;
}

interface StockMovementDto {
  id: string;
  type: "initial" | "inbound" | "consumption" | "revoke" | "adjustment";
  quantityDelta: number;
  stockAfter: number;
  operatorName: string;
  refType: string | null;
  refId: string | null;
  note: string | null;
  createdAt: number;
}

interface StatsOverviewDto {
  range: { start: string; end: string; period: "week" | "month" | "year" };
  totals: {
    quantity: number;
    usageCount: number;
    itemKinds: number;
    recordCount: number;
    acceptedCount: number;
  };
  byItem: {
    itemId: string;
    itemName: string;
    spec: string | null;
    unit: string;
    quantity: number;
    usageCount: number;
    share: number;
  }[];
  byDay: { date: string; quantity: number; usageCount: number }[];
  byPatientType: { outpatient: number; inpatient: number };
  alerts: {
    pendingRevocations: number;
    openExceptions: number;
    lowStockItems: {
      itemId: string;
      itemName: string;
      stock: number;
      minStock: number;
    }[];
  };
}
```

## 4. oRPC Procedures

### 4.1 me

| Procedure           | 入参                               | 返回                               | 权限                                            |
| ------------------- | ---------------------------------- | ---------------------------------- | ----------------------------------------------- |
| `me.get`            | `{ teamId? }`                      | `{ user: ProfileDto; team: TeamDto | null; teams: TeamDto[]; matters: MatterDto[] }` | 登录；超级管理员传 teamId 切换团队 |
| `me.changePassword` | `{ currentPassword, newPassword }` | `{ ok: true }`                     | 登录（本人）                                    |

### 4.2 teams（超级管理员）

| Procedure      | 入参                                              | 返回                                     |
| -------------- | ------------------------------------------------- | ---------------------------------------- |
| `teams.list`   | —                                                 | `TeamDto[]`                              |
| `teams.create` | `{ name, code, description?, timezone? }`         | `TeamDto`                                |
| `teams.update` | `{ id, name?, description?, timezone?, status? }` | `TeamDto`                                |
| `teams.remove` | `{ id }`                                          | `{ ok: true }`；有用户/事项时 `CONFLICT` |

### 4.3 users

| Procedure             | 入参                                                  | 返回           | 权限                                              |
| --------------------- | ----------------------------------------------------- | -------------- | ------------------------------------------------- |
| `users.list`          | `{ teamId?, role?, status?, q? }`                     | `ProfileDto[]` | 团队管理员/超级管理员                             |
| `users.create`        | `{ username, password, name, role, teamId?, phone? }` | `ProfileDto`   | 团队管理员只能创建本团队 member；超级管理员可任意 |
| `users.update`        | `{ id, name?, phone?, role?, teamId?, status? }`      | `ProfileDto`   | 同上；不能修改自己角色/状态                       |
| `users.resetPassword` | `{ id, newPassword }`                                 | `{ ok: true }` | 同上                                              |
| `users.remove`        | `{ id }`                                              | `{ ok: true }` | 同上；有业务记录时 `CONFLICT`（改用停用）         |

### 4.4 matters（交接事项）

| Procedure          | 入参                                          | 返回                                                                                                                   | 权限                                               |
| ------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `matters.list`     | `{ teamId?, includeArchived? }`               | `MatterDto[]`                                                                                                          | 登录                                               |
| `matters.create`   | `{ name, code?, description?, teamId? }`      | `MatterDto`                                                                                                            | 管理员                                             |
| `matters.update`   | `{ id, name?, code?, description?, status? }` | `MatterDto`                                                                                                            | 管理员                                             |
| `matters.rotateQr` | `{ id }`                                      | `{ qrToken, qrVersion }`                                                                                               | 管理员；生成新 token，旧码失效                     |
| `matters.byToken`  | `{ token, subWarehouseId? }`                  | `{ matter; team; subWarehouses: SubWarehouseDto[]; selectedSubWarehouseId; today: RecordDetailDto; items: ItemDto[] }` | 登录且属于该团队；不传子仓库时默认第一个启用子仓库 |
| `matters.archive`  | `{ id }`                                      | `MatterDto`                                                                                                            | 管理员（归档，不物理删除）                         |

### 4.4.1 subWarehouses（子仓库）

| Procedure              | 入参                                                                 | 返回                | 权限                                        |
| ---------------------- | -------------------------------------------------------------------- | ------------------- | ------------------------------------------- |
| `subWarehouses.list`   | `{ matterId, includeArchived? }`                                     | `SubWarehouseDto[]` | 登录（团队隔离）                            |
| `subWarehouses.create` | `{ matterId, name, code?, location?, description?, sortOrder? }`     | `SubWarehouseDto`   | 管理员；同一事项名称唯一                    |
| `subWarehouses.update` | `{ id, name?, code?, location?, description?, sortOrder?, status? }` | `SubWarehouseDto`   | 管理员；停用后不可新交接/用物/调拨          |
| `subWarehouses.remove` | `{ id }`                                                             | `{ ok: true }`      | 管理员；有物品/交接/消耗/调拨记录时只能停用 |

### 4.5 items

| Procedure         | 入参                                                                                                | 返回                                | 权限                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------ |
| `items.list`      | `{ matterId? , subWarehouseId?, includeArchived? }`                                                 | `ItemDto[]`                         | 登录（团队隔离）；matterId 与 subWarehouseId 至少一个                                      |
| `items.create`    | `{ subWarehouseId?, matterId?, name, spec?, unit, category?, stock?, minStock?, location?, note? }` | `ItemDto`                           | 管理员；不传子仓库时取事项第一个启用子仓库；stock>0 写 initial 流水                        |
| `items.update`    | `{ id, name?, spec?, unit?, category?, minStock?, location?, note?, status? }`                      | `ItemDto`                           | 管理员（不允许直接改 stock）                                                               |
| `items.inbound`   | `{ id, quantity, note? }`                                                                           | `ItemDto`                           | 管理员；库存 + quantity，写 inbound 流水                                                   |
| `items.adjust`    | `{ id, quantityDelta, note }`                                                                       | `ItemDto`                           | 管理员；盘点/异常调整，reason 必填，写 adjustment 流水                                     |
| `items.movements` | `{ itemId }`                                                                                        | `StockMovementDto[]`（最多 100 条） | 登录（团队隔离）                                                                           |
| `items.remove`    | `{ id }`                                                                                            | `{ ok: true }`                      | 管理员；有 usage_item / stock_movement / handover_record_item 快照时只能停用（`CONFLICT`） |
| `items.transfer`  | `{ fromSubWarehouseId, toSubWarehouseId, itemId, quantity, note? }`                                 | `StockTransferDto`                  | 管理员；同事项、不同子仓库、双边事务扣增；调入无同名同规格物品时自动建档                   |
| `items.transfers` | `{ matterId, subWarehouseId? }`                                                                     | `StockTransferDto[]`（最近 50 条）  | 登录（团队隔离）                                                                           |

### 4.6 records（交接记录）

| Procedure                | 入参                                                                                       | 返回                                                   | 权限                                           |
| ------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------- |
| `records.today`          | `{ matterId, subWarehouseId?, date? }`                                                     | `RecordDetailDto`（按子仓库+日期，不存在则创建）       | 登录（团队隔离）；不传子仓库取第一个启用子仓库 |
| `records.list`           | `{ matterId?, subWarehouseId?, teamId?, period?, anchorDate?, status?, page?, pageSize? }` | `{ items: RecordSummaryDto[]; total; page; pageSize }` | 登录                                           |
| `records.get`            | `{ id }`                                                                                   | `RecordDetailDto`                                      | 登录                                           |
| `records.accept`         | `{ id, items: { itemId, checked, actualQty?, note? }[], note? }`                           | `RecordDetailDto`                                      | 登录；状态必须 pending_acceptance              |
| `records.submitHandover` | `{ id, items: { itemId, checked, actualQty?, note? }[], note? }`                           | `RecordDetailDto`                                      | 登录；状态必须 accepted                        |
| `records.remove`         | `{ id }`                                                                                   | `{ ok: true }`                                         | 管理员；仅当无消耗记录                         |

验收规则：清单中每一项都必须出现在入参且 `checked=true`；实盘数与应有数不一致时必须填写该行 note。差异只写入清单，不自动创建异常；用户需通过 `exceptions.create` 提交异常上报后，`usage.create` 与 `records.submitHandover` 才会放行。

交班规则：接班验收有差异且记录无异常上报时，`records.submitHandover` 返回 `CONFLICT`；权限 `canHandover=false`。

### 4.7 usage（用物消耗）

> 流程门禁：`usage.create` 要求 `subWarehouseId + usedAt` 存在交接记录且状态为 accepted（已交班不可再普通登记）；若验收存在数量差异且该记录没有任何异常事件，返回 `CONFLICT`。
> `usage.backfill` 是独立补登记入口：登录即可，不要求交接记录/接班状态；必须提供 `usedAt`、`usedTime`（HH:mm）、`backfillReason`（2–300 字）与物品数量；不允许未来日期；扣减来源物品库存。

| Procedure              | 入参                                                                                                                     | 返回                                  | 权限                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------- |
| `usage.list`           | `{ matterId?, subWarehouseId?, teamId?, from?, to?, status?, page?, pageSize? }`                                         | 分页 `UsageDto[]`                     | 登录（团队隔离）                                                              |
| `usage.get`            | `{ id }`                                                                                                                 | `UsageDto`                            | 登录                                                                          |
| `usage.create`         | `{ matterId, subWarehouseId?, usedAt, patientName, patientType, patientNo, patientPhone?, operatorName?, note?, items }` | `UsageDto`                            | 登录；事务扣来源库存。前置：子仓库当日记录已接收；有差异需先异常上报          |
| `usage.backfill`       | `{ matterId, subWarehouseId?, usedAt, usedTime, backfillReason, patient..., items }`                                     | `UsageDto`（`isBackfill=true`）       | 登录；不受接班门禁限制；时间/数量/原因必填；禁止未来日期                      |
| `usage.requestRevoke`  | `{ id, reason }`                                                                                                         | `RevokeRequestDto`                    | 记录所属团队成员                                                              |
| `usage.pendingRevokes` | `{ teamId? }`                                                                                                            | `RevokeRequestDto[]`（含 usage 摘要） | 管理员                                                                        |
| `usage.reviewRevoke`   | `{ requestId, approve, note? }`                                                                                          | `UsageDto`                            | 管理员；通过则恢复库存并置 revoked；驳回则 usage 恢复 active、申请置 rejected |

### 4.8 exceptions

| Procedure            | 入参                                                             | 返回                  | 权限   |
| -------------------- | ---------------------------------------------------------------- | --------------------- | ------ |
| `exceptions.list`    | `{ matterId?, teamId?, status?, page?, pageSize? }`              | 分页 `ExceptionDto[]` | 登录   |
| `exceptions.create`  | `{ matterId, recordId?, itemId?, type, severity?, description }` | `ExceptionDto`        | 登录   |
| `exceptions.resolve` | `{ id, resolution }`                                             | `ExceptionDto`        | 管理员 |

### 4.9 stats

| Procedure        | 入参                                                                   | 返回               | 权限   |
| ---------------- | ---------------------------------------------------------------------- | ------------------ | ------ |
| `stats.overview` | `{ teamId?, matterId?, period: "week"\|"month"\|"year", anchorDate? }` | `StatsOverviewDto` | 管理员 |

`byItem` 按“物品名称 + 规格 + 单位”合并同一物品档案，并附带 `subWarehouseBreakdown`（子仓库、数量、使用次数）用于前端折叠展开；`totals.itemKinds` 为合并后的档案数。

统计口径：统计 `status in ('active','revoke_pending')` 的消耗记录（待审批撤销未生效，仍计入；已批准撤销的 `revoked` 排除）；`quantity` 为物品件数合计；`byItem.share` 为数量占比（0-1，保留 4 位）；周期按团队时区自然周（周一至周日）/自然月/自然年。

## 5. 服务端权限实现约定

- `protectedProcedure`：校验 session → 查询 `user` 表（实时角色/团队/状态）→ 挂到 `context.user`；非 active 抛 `UNAUTHORIZED`。
- `adminProcedure`：`role ∈ {super_admin, team_admin}`。
- `superAdminProcedure`：`role === super_admin`。
- 团队作用域辅助函数：`resolveTeamId(ctx, inputTeamId?)`、`assertMatterAccess(ctx, matterId)`、`assertTeamScope(ctx, teamId)`。
- 所有写操作在同一事务内完成库存/状态变更，并写操作人快照。
