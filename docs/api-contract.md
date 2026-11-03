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

interface ItemDto {
  id: string;
  matterId: string;
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
  permissions: { canAccept: boolean; canHandover: boolean; canDelete: boolean };
}

interface UsageItemDto {
  itemId: string;
  itemName: string;
  itemSpec: string | null;
  unit: string;
  quantity: number;
}

interface UsageDto {
  id: string;
  matterId: string;
  matterName: string;
  recordId: string | null;
  usedAt: string;
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
| `me.get`            | —                                  | `{ user: ProfileDto; team: TeamDto | null; teams: TeamDto[]; matters: MatterDto[] }` | 登录 |
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

| Procedure          | 入参                                          | 返回                                                                             | 权限                           |
| ------------------ | --------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------ |
| `matters.list`     | `{ teamId?, includeArchived? }`               | `MatterDto[]`                                                                    | 登录                           |
| `matters.create`   | `{ name, code?, description?, teamId? }`      | `MatterDto`                                                                      | 管理员                         |
| `matters.update`   | `{ id, name?, code?, description?, status? }` | `MatterDto`                                                                      | 管理员                         |
| `matters.rotateQr` | `{ id }`                                      | `{ qrToken, qrVersion }`                                                         | 管理员；生成新 token，旧码失效 |
| `matters.byToken`  | `{ token }`                                   | `{ matter: MatterDto; team: TeamDto; today: RecordDetailDto; items: ItemDto[] }` | 登录且属于该团队               |
| `matters.archive`  | `{ id }`                                      | `MatterDto`                                                                      | 管理员（归档，不物理删除）     |

### 4.5 items

| Procedure         | 入参                                                                              | 返回                                | 权限                                                   |
| ----------------- | --------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------ |
| `items.list`      | `{ matterId, includeArchived? }`                                                  | `ItemDto[]`                         | 登录（团队隔离）                                       |
| `items.create`    | `{ matterId, name, spec?, unit, category?, stock?, minStock?, location?, note? }` | `ItemDto`                           | 管理员；stock>0 写 initial 流水                        |
| `items.update`    | `{ id, name?, spec?, unit?, category?, minStock?, location?, note?, status? }`    | `ItemDto`                           | 管理员（不允许直接改 stock）                           |
| `items.inbound`   | `{ id, quantity, note? }`                                                         | `ItemDto`                           | 管理员；库存 + quantity，写 inbound 流水               |
| `items.adjust`    | `{ id, quantityDelta, note }`                                                     | `ItemDto`                           | 管理员；盘点/异常调整，reason 必填，写 adjustment 流水 |
| `items.movements` | `{ itemId }`                                                                      | `StockMovementDto[]`（最多 100 条） | 登录（团队隔离）                                       |
| `items.remove`    | `{ id }`                                                                          | `{ ok: true }`                      | 管理员；有流水/明细时只能停用（`CONFLICT`）            |

### 4.6 records（交接记录）

| Procedure                | 入参                                                                                                      | 返回                                                   | 权限                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------- |
| `records.today`          | `{ matterId, date? }`                                                                                     | `RecordDetailDto`（不存在则创建）                      | 登录（团队隔离）                  |
| `records.list`           | `{ matterId?, teamId?, period?: "day"\|"week"\|"month"\|"year", anchorDate?, status?, page?, pageSize? }` | `{ items: RecordSummaryDto[]; total; page; pageSize }` | 登录                              |
| `records.get`            | `{ id }`                                                                                                  | `RecordDetailDto`                                      | 登录                              |
| `records.accept`         | `{ id, items: { itemId, checked, actualQty?, note? }[], note? }`                                          | `RecordDetailDto`                                      | 登录；状态必须 pending_acceptance |
| `records.submitHandover` | `{ id, items: { itemId, checked, actualQty?, note? }[], note? }`                                          | `RecordDetailDto`                                      | 登录；状态必须 accepted           |
| `records.remove`         | `{ id }`                                                                                                  | `{ ok: true }`                                         | 管理员；仅当无消耗记录            |

验收规则：清单中每一项都必须出现在入参且 `checked=true`；实盘数与应有数不一致时必须填写该行 note（自动生成 count_mismatch 异常事件）。

### 4.7 usage（用物消耗）

| Procedure              | 入参                                                                                                                            | 返回                                  | 权限                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------- |
| `usage.list`           | `{ matterId?, teamId?, from?, to?, status?, page?, pageSize? }`                                                                 | 分页 `UsageDto[]`                     | 登录（团队隔离）       |
| `usage.get`            | `{ id }`                                                                                                                        | `UsageDto`                            | 登录                   |
| `usage.create`         | `{ matterId, usedAt, patientName, patientType, patientNo, patientPhone?, operatorName?, note?, items: { itemId, quantity }[] }` | `UsageDto`                            | 登录；事务扣库存       |
| `usage.requestRevoke`  | `{ id, reason }`                                                                                                                | `RevokeRequestDto`                    | 记录所属团队成员       |
| `usage.pendingRevokes` | `{ teamId? }`                                                                                                                   | `RevokeRequestDto[]`（含 usage 摘要） | 管理员                 |
| `usage.reviewRevoke`   | `{ requestId, approve, note? }`                                                                                                 | `UsageDto`                            | 管理员；通过则恢复库存 |

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

统计口径：只统计 `status = active` 的消耗记录；`quantity` 为物品件数合计；`byItem.share` 为数量占比（0-1，保留 4 位）；周期按团队时区自然周（周一至周日）/自然月/自然年。

## 5. 服务端权限实现约定

- `protectedProcedure`：校验 session → 查询 `user` 表（实时角色/团队/状态）→ 挂到 `context.user`；非 active 抛 `UNAUTHORIZED`。
- `adminProcedure`：`role ∈ {super_admin, team_admin}`。
- `superAdminProcedure`：`role === super_admin`。
- 团队作用域辅助函数：`resolveTeamId(ctx, inputTeamId?)`、`assertMatterAccess(ctx, matterId)`、`assertTeamScope(ctx, teamId)`。
- 所有写操作在同一事务内完成库存/状态变更，并写操作人快照。
