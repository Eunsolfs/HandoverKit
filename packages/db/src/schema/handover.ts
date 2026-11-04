import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import {
  check,
  index,
  integer,
  snakeCase,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(cast(unixepoch('subsec') * 1000 as integer))`;

const timestamp = () => integer({ mode: "timestamp_ms" });

const timestamps = {
  createdAt: timestamp().notNull().default(now),
  updatedAt: timestamp()
    .notNull()
    .default(now)
    .$onUpdate(() => new Date()),
};

const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => randomUUID());

export const ROLE_VALUES = ["super_admin", "team_admin", "member"] as const;
export const TEAM_STATUS_VALUES = ["active", "archived"] as const;
export const MATTER_STATUS_VALUES = ["active", "archived"] as const;
export const SUB_WAREHOUSE_STATUS_VALUES = ["active", "archived"] as const;
export const ITEM_STATUS_VALUES = ["active", "archived"] as const;
export const USER_STATUS_VALUES = ["active", "disabled"] as const;

export const RECORD_STATUS_VALUES = [
  "pending_acceptance",
  "accepted",
  "handover_submitted",
] as const;

export const USAGE_STATUS_VALUES = [
  "active",
  "revoke_pending",
  "revoked",
] as const;

export const MOVEMENT_TYPE_VALUES = [
  "initial",
  "inbound",
  "consumption",
  "revoke",
  "adjustment",
  "transfer_in",
  "transfer_out",
] as const;

export const EXCEPTION_TYPE_VALUES = [
  "missing",
  "damaged",
  "count_mismatch",
  "other",
] as const;

export const EXCEPTION_SEVERITY_VALUES = ["low", "medium", "high"] as const;
export const EXCEPTION_STATUS_VALUES = ["open", "resolved"] as const;

export const REVOKE_STATUS_VALUES = [
  "pending",
  "approved",
  "rejected",
] as const;

export const PATIENT_TYPE_VALUES = ["outpatient", "inpatient"] as const;

const inList = (column: AnySQLiteColumn, values: readonly string[]) =>
  sql`${column} in (${sql.raw(values.map((value) => `'${value}'`).join(", "))})`;

/** 团队：超级管理员创建，业务数据按团队隔离。 */
export const team = snakeCase.table(
  "team",
  {
    id: id(),
    name: text().notNull(),
    code: text().notNull(),
    description: text(),
    timezone: text().notNull().default("Asia/Shanghai"),
    status: text().notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("team_name_unique").on(table.name),
    uniqueIndex("team_code_unique").on(table.code),
    check("team_status_check", inList(table.status, TEAM_STATUS_VALUES)),
    check(
      "team_name_length",
      sql`length(trim(${table.name})) between 1 and 60`
    ),
  ]
);

/** 交接事项 = 独立用物仓库 + 固定二维码。 */
export const matter = snakeCase.table(
  "matter",
  {
    id: id(),
    teamId: text()
      .notNull()
      .references(() => team.id, { onDelete: "restrict" }),
    name: text().notNull(),
    code: text(),
    description: text(),
    status: text().notNull().default("active"),
    qrToken: text().notNull(),
    qrVersion: integer().notNull().default(1),
    qrChangedAt: timestamp(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("matter_qr_token_unique").on(table.qrToken),
    uniqueIndex("matter_team_name_unique").on(table.teamId, table.name),
    index("matter_team_status_idx").on(table.teamId, table.status),
    check("matter_status_check", inList(table.status, MATTER_STATUS_VALUES)),
    check(
      "matter_name_length",
      sql`length(trim(${table.name})) between 1 and 60`
    ),
    check("matter_qr_version_positive", sql`${table.qrVersion} >= 1`),
  ]
);

/** 子仓库：同一交接事项下按使用地点划分的物理库存。 */
export const subWarehouse = snakeCase.table(
  "sub_warehouse",
  {
    id: id(),
    matterId: text()
      .notNull()
      .references(() => matter.id, { onDelete: "cascade" }),
    name: text().notNull(),
    code: text(),
    location: text(),
    description: text(),
    status: text().notNull().default("active"),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("sub_warehouse_matter_name_unique").on(
      table.matterId,
      table.name
    ),
    index("sub_warehouse_matter_status_idx").on(table.matterId, table.status),
    check(
      "sub_warehouse_status_check",
      inList(table.status, SUB_WAREHOUSE_STATUS_VALUES)
    ),
    check(
      "sub_warehouse_name_length",
      sql`length(trim(${table.name})) between 1 and 60`
    ),
  ]
);

/** 物品（子仓库库存行），stock 为当前子仓库库存，由流水驱动。 */
export const item = snakeCase.table(
  "item",
  {
    id: id(),
    matterId: text()
      .notNull()
      .references(() => matter.id, { onDelete: "cascade" }),
    subWarehouseId: text()
      .notNull()
      .references(() => subWarehouse.id, { onDelete: "cascade" }),
    name: text().notNull(),
    spec: text(),
    unit: text().notNull(),
    category: text(),
    stock: integer().notNull().default(0),
    minStock: integer().notNull().default(0),
    location: text(),
    note: text(),
    status: text().notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("item_sub_warehouse_name_unique").on(
      table.subWarehouseId,
      table.name
    ),
    index("item_matter_status_idx").on(table.matterId, table.status),
    index("item_sub_warehouse_status_idx").on(
      table.subWarehouseId,
      table.status
    ),
    check("item_status_check", inList(table.status, ITEM_STATUS_VALUES)),
    check("item_stock_non_negative", sql`${table.stock} >= 0`),
    check("item_min_stock_non_negative", sql`${table.minStock} >= 0`),
    check(
      "item_name_length",
      sql`length(trim(${table.name})) between 1 and 80`
    ),
    check(
      "item_unit_length",
      sql`length(trim(${table.unit})) between 1 and 20`
    ),
  ]
);

/** 库存流水：不可变审计。 */
export const stockMovement = snakeCase.table(
  "stock_movement",
  {
    id: id(),
    matterId: text()
      .notNull()
      .references(() => matter.id, { onDelete: "cascade" }),
    subWarehouseId: text()
      .notNull()
      .references(() => subWarehouse.id, { onDelete: "cascade" }),
    itemId: text()
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    type: text().notNull(),
    quantityDelta: integer().notNull(),
    stockAfter: integer().notNull(),
    operatorUserId: text().notNull(),
    operatorName: text().notNull(),
    refType: text(),
    refId: text(),
    note: text(),
    createdAt: timestamp().notNull().default(now),
  },
  (table) => [
    index("stock_movement_item_created_idx").on(table.itemId, table.createdAt),
    index("stock_movement_matter_created_idx").on(
      table.matterId,
      table.createdAt
    ),
    index("stock_movement_sub_warehouse_created_idx").on(
      table.subWarehouseId,
      table.createdAt
    ),
    check(
      "stock_movement_type_check",
      inList(table.type, MOVEMENT_TYPE_VALUES)
    ),
    check(
      "stock_movement_stock_after_non_negative",
      sql`${table.stockAfter} >= 0`
    ),
  ]
);

/** 交接记录：一个交接事项一天的记录，含接班验收与交班提交。 */
export const handoverRecord = snakeCase.table(
  "handover_record",
  {
    id: id(),
    matterId: text()
      .notNull()
      .references(() => matter.id, { onDelete: "cascade" }),
    subWarehouseId: text()
      .notNull()
      .references(() => subWarehouse.id, { onDelete: "cascade" }),
    recordDate: text().notNull(),
    status: text().notNull().default("pending_acceptance"),
    acceptedByUserId: text(),
    acceptedByName: text(),
    acceptedAt: timestamp(),
    handoverByUserId: text(),
    handoverByName: text(),
    handoverAt: timestamp(),
    acceptanceNote: text(),
    handoverNote: text(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("handover_record_sub_warehouse_date_unique").on(
      table.subWarehouseId,
      table.recordDate
    ),
    index("handover_record_matter_created_idx").on(
      table.matterId,
      table.createdAt
    ),
    index("handover_record_sub_warehouse_created_idx").on(
      table.subWarehouseId,
      table.createdAt
    ),
    index("handover_record_status_idx").on(table.status),
    check(
      "handover_record_status_check",
      inList(table.status, RECORD_STATUS_VALUES)
    ),
    check(
      "handover_record_date_format",
      sql`length(${table.recordDate}) = 10 and ${table.recordDate} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`
    ),
  ]
);

/** 交接清单快照：生成时锁定物品名称/规格/应有数量。 */
export const handoverRecordItem = snakeCase.table(
  "handover_record_item",
  {
    id: id(),
    recordId: text()
      .notNull()
      .references(() => handoverRecord.id, { onDelete: "cascade" }),
    itemId: text()
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    itemName: text().notNull(),
    itemSpec: text(),
    unit: text().notNull(),
    expectedQty: integer().notNull(),
    checked: integer({ mode: "boolean" }).notNull().default(false),
    actualQty: integer(),
    note: text(),
    acceptedAt: timestamp(),
    handoverChecked: integer({ mode: "boolean" }).notNull().default(false),
    handoverActualQty: integer(),
    handoverNote: text(),
  },
  (table) => [
    index("handover_record_item_record_idx").on(table.recordId),
    uniqueIndex("handover_record_item_record_item_unique").on(
      table.recordId,
      table.itemId
    ),
    check(
      "handover_record_item_expected_non_negative",
      sql`${table.expectedQty} >= 0`
    ),
    check(
      "handover_record_item_actual_non_negative",
      sql`${table.actualQty} is null or ${table.actualQty} >= 0`
    ),
  ]
);

/** 用物消耗记录（一次使用事件，可含多种物品）。 */
export const usageRecord = snakeCase.table(
  "usage_record",
  {
    id: id(),
    matterId: text()
      .notNull()
      .references(() => matter.id, { onDelete: "cascade" }),
    subWarehouseId: text()
      .notNull()
      .references(() => subWarehouse.id, { onDelete: "restrict" }),
    recordId: text().references(() => handoverRecord.id, {
      onDelete: "set null",
    }),
    usedAt: text().notNull(),
    /** 补录时的具体使用时间（HH:mm，24 小时制）；普通登记为空，由 createdAt 体现。 */
    usedAtTime: text(),
    /** 是否为补登记记录（补录不受接班门禁限制，但必须填写原因）。 */
    isBackfill: integer({ mode: "boolean" }).notNull().default(false),
    backfillReason: text(),
    patientName: text().notNull(),
    patientType: text().notNull(),
    patientNo: text().notNull(),
    patientPhone: text(),
    operatorUserId: text().notNull(),
    operatorName: text().notNull(),
    note: text(),
    status: text().notNull().default("active"),
    revokedAt: timestamp(),
    ...timestamps,
  },
  (table) => [
    index("usage_record_matter_used_at_idx").on(table.matterId, table.usedAt),
    index("usage_record_sub_warehouse_used_at_idx").on(
      table.subWarehouseId,
      table.usedAt
    ),
    index("usage_record_record_idx").on(table.recordId),
    index("usage_record_status_idx").on(table.status),
    check(
      "usage_record_status_check",
      inList(table.status, USAGE_STATUS_VALUES)
    ),
    check(
      "usage_record_patient_type_check",
      inList(table.patientType, PATIENT_TYPE_VALUES)
    ),
    check(
      "usage_record_date_format",
      sql`length(${table.usedAt}) = 10 and ${table.usedAt} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`
    ),
    check(
      "usage_record_time_format",
      sql`${table.usedAtTime} is null or ${table.usedAtTime} glob '[0-2][0-9]:[0-5][0-9]'`
    ),
    check(
      "usage_record_backfill_reason",
      sql`${table.isBackfill} = 0 or (${table.backfillReason} is not null and length(trim(${table.backfillReason})) between 2 and 300)`
    ),
  ]
);

export const usageItem = snakeCase.table(
  "usage_item",
  {
    id: id(),
    usageId: text()
      .notNull()
      .references(() => usageRecord.id, { onDelete: "cascade" }),
    itemId: text()
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    itemName: text().notNull(),
    itemSpec: text(),
    unit: text().notNull(),
    quantity: integer().notNull(),
  },
  (table) => [
    index("usage_item_usage_idx").on(table.usageId),
    index("usage_item_item_idx").on(table.itemId),
    check("usage_item_quantity_positive", sql`${table.quantity} > 0`),
  ]
);

/** 子仓库调拨：同一事项下从一个子仓库调拨到另一个子仓库。 */
export const stockTransfer = snakeCase.table(
  "stock_transfer",
  {
    id: id(),
    matterId: text()
      .notNull()
      .references(() => matter.id, { onDelete: "cascade" }),
    fromSubWarehouseId: text()
      .notNull()
      .references(() => subWarehouse.id, { onDelete: "restrict" }),
    toSubWarehouseId: text()
      .notNull()
      .references(() => subWarehouse.id, { onDelete: "restrict" }),
    sourceItemId: text()
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    targetItemId: text()
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    itemName: text().notNull(),
    itemSpec: text(),
    unit: text().notNull(),
    quantity: integer().notNull(),
    operatorUserId: text().notNull(),
    operatorName: text().notNull(),
    note: text(),
    createdAt: timestamp().notNull().default(now),
  },
  (table) => [
    index("stock_transfer_matter_created_idx").on(
      table.matterId,
      table.createdAt
    ),
    index("stock_transfer_from_created_idx").on(
      table.fromSubWarehouseId,
      table.createdAt
    ),
    index("stock_transfer_to_created_idx").on(
      table.toSubWarehouseId,
      table.createdAt
    ),
    check("stock_transfer_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "stock_transfer_warehouses_differ",
      sql`${table.fromSubWarehouseId} <> ${table.toSubWarehouseId}`
    ),
  ]
);

export const revokeRequest = snakeCase.table(
  "revoke_request",
  {
    id: id(),
    usageId: text()
      .notNull()
      .references(() => usageRecord.id, { onDelete: "cascade" }),
    status: text().notNull().default("pending"),
    reason: text().notNull(),
    requestedByUserId: text().notNull(),
    requestedByName: text().notNull(),
    reviewedByUserId: text(),
    reviewedByName: text(),
    reviewedAt: timestamp(),
    reviewNote: text(),
    ...timestamps,
  },
  (table) => [
    index("revoke_request_status_idx").on(table.status),
    index("revoke_request_usage_idx").on(table.usageId),
    check(
      "revoke_request_status_check",
      inList(table.status, REVOKE_STATUS_VALUES)
    ),
  ]
);

/** 异常事件：发现、上报、处置闭环。 */
export const exceptionEvent = snakeCase.table(
  "exception_event",
  {
    id: id(),
    matterId: text()
      .notNull()
      .references(() => matter.id, { onDelete: "cascade" }),
    recordId: text().references(() => handoverRecord.id, {
      onDelete: "set null",
    }),
    itemId: text().references(() => item.id, { onDelete: "set null" }),
    type: text().notNull(),
    severity: text().notNull().default("medium"),
    description: text().notNull(),
    status: text().notNull().default("open"),
    reportedByUserId: text().notNull(),
    reportedByName: text().notNull(),
    resolvedByUserId: text(),
    resolvedByName: text(),
    resolution: text(),
    resolvedAt: timestamp(),
    ...timestamps,
  },
  (table) => [
    index("exception_event_matter_status_idx").on(table.matterId, table.status),
    index("exception_event_record_idx").on(table.recordId),
    check(
      "exception_event_type_check",
      inList(table.type, EXCEPTION_TYPE_VALUES)
    ),
    check(
      "exception_event_severity_check",
      inList(table.severity, EXCEPTION_SEVERITY_VALUES)
    ),
    check(
      "exception_event_status_check",
      inList(table.status, EXCEPTION_STATUS_VALUES)
    ),
    check(
      "exception_event_description_length",
      sql`length(trim(${table.description})) between 1 and 500`
    ),
  ]
);
