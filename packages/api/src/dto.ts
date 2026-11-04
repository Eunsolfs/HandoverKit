import type { user } from "@handoverkit/db/schema/auth";
import { ROLE_VALUES, USER_STATUS_VALUES } from "@handoverkit/db/schema/auth";
import type {
  exceptionEvent,
  handoverRecord,
  handoverRecordItem,
  item,
  matter,
  revokeRequest,
  stockMovement,
  stockTransfer,
  subWarehouse,
  team,
  usageItem,
  usageRecord,
} from "@handoverkit/db/schema/handover";
import {
  EXCEPTION_SEVERITY_VALUES,
  EXCEPTION_STATUS_VALUES,
  EXCEPTION_TYPE_VALUES,
  ITEM_STATUS_VALUES,
  MATTER_STATUS_VALUES,
  MOVEMENT_TYPE_VALUES,
  PATIENT_TYPE_VALUES,
  SUB_WAREHOUSE_STATUS_VALUES,
  RECORD_STATUS_VALUES,
  REVOKE_STATUS_VALUES,
  TEAM_STATUS_VALUES,
  USAGE_STATUS_VALUES,
} from "@handoverkit/db/schema/handover";

import type { StatsPeriod } from "#src/lib/dates.ts";

type Role = (typeof ROLE_VALUES)[number];

type UserStatus = (typeof USER_STATUS_VALUES)[number];

type TeamStatus = (typeof TEAM_STATUS_VALUES)[number];

type MatterStatus = (typeof MATTER_STATUS_VALUES)[number];

type ItemStatus = (typeof ITEM_STATUS_VALUES)[number];

export type RecordStatus = (typeof RECORD_STATUS_VALUES)[number];

type UsageStatus = (typeof USAGE_STATUS_VALUES)[number];

type PatientType = (typeof PATIENT_TYPE_VALUES)[number];

type RevokeStatus = (typeof REVOKE_STATUS_VALUES)[number];

type ExceptionType = (typeof EXCEPTION_TYPE_VALUES)[number];

type ExceptionSeverity = (typeof EXCEPTION_SEVERITY_VALUES)[number];

type ExceptionStatus = (typeof EXCEPTION_STATUS_VALUES)[number];

type StockMovementType = (typeof MOVEMENT_TYPE_VALUES)[number];

type UserRow = typeof user.$inferSelect;

type TeamRow = typeof team.$inferSelect;

type MatterRow = typeof matter.$inferSelect;

type ItemRow = typeof item.$inferSelect;

type RecordRow = typeof handoverRecord.$inferSelect;

type RecordItemRow = typeof handoverRecordItem.$inferSelect;

type UsageRow = typeof usageRecord.$inferSelect;

type UsageItemRow = typeof usageItem.$inferSelect;

type RevokeRow = typeof revokeRequest.$inferSelect;

type ExceptionRow = typeof exceptionEvent.$inferSelect;

type MovementRow = typeof stockMovement.$inferSelect;

type SubWarehouseRow = typeof subWarehouse.$inferSelect;

type StockTransferRow = typeof stockTransfer.$inferSelect;

export interface ProfileDto {
  id: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  teamId: string | null;
  teamName: string | null;
  phone: string | null;
  status: UserStatus;
}

export interface TeamDto {
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

export interface MatterDto {
  id: string;
  teamId: string;
  teamName: string;
  name: string;
  code: string | null;
  description: string | null;
  status: MatterStatus;
  qrToken: string;
  qrVersion: number;
  qrChangedAt: number | null;
  itemCount: number;
  todayStatus: RecordStatus | null;
  createdAt: number;
}

export interface SubWarehouseDto {
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

export interface ItemDto {
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
  status: ItemStatus;
  lowStock: boolean;
  createdAt: number;
}

export interface RecordItemDto {
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

export interface RecordSummaryDto {
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

interface RecordPermissions {
  canAccept: boolean;
  canHandover: boolean;
  canDelete: boolean;
  /** 接班核对存在数量差异且尚未提交异常上报。 */
  requiresExceptionReport: boolean;
  /** 当前是否允许登记用物（已接班且无未上报差异）。 */
  canRegisterUsage: boolean;
}

export interface RecordDetailDto extends RecordSummaryDto {
  acceptanceNote: string | null;
  handoverNote: string | null;
  items: RecordItemDto[];
  usages: UsageDto[];
  exceptions: ExceptionDto[];
  revokeRequests: RevokeRequestDto[];
  permissions: RecordPermissions;
}

export interface UsageItemDto {
  itemId: string;
  sourceSubWarehouseName: string;
  itemName: string;
  itemSpec: string | null;
  unit: string;
  quantity: number;
}

export interface UsageDto {
  id: string;
  matterId: string;
  matterName: string;
  subWarehouseId: string;
  subWarehouseName: string;
  recordId: string | null;
  usedAt: string;
  /** 补录时的具体使用时间（HH:mm）；普通登记为 null。 */
  usedAtTime: string | null;
  /** 是否为补登记记录。 */
  isBackfill: boolean;
  /** 补录原因（isBackfill 为 true 时必有值）。 */
  backfillReason: string | null;
  patientName: string;
  patientType: PatientType;
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

export interface RevokeRequestDto {
  id: string;
  usageId: string;
  status: RevokeStatus;
  reason: string;
  requestedByName: string;
  requestedAt: number;
  reviewedByName: string | null;
  reviewedAt: number | null;
  reviewNote: string | null;
}

export interface ExceptionDto {
  id: string;
  matterId: string;
  matterName: string;
  recordId: string | null;
  itemId: string | null;
  type: ExceptionType;
  severity: ExceptionSeverity;
  description: string;
  status: ExceptionStatus;
  reportedByName: string;
  reportedAt: number;
  resolvedByName: string | null;
  resolvedAt: number | null;
  resolution: string | null;
}

export interface StockMovementDto {
  id: string;
  subWarehouseId: string;
  type: StockMovementType;
  quantityDelta: number;
  stockAfter: number;
  operatorName: string;
  refType: string | null;
  refId: string | null;
  note: string | null;
  createdAt: number;
}

export interface StockTransferDto {
  id: string;
  matterId: string;
  fromSubWarehouseId: string;
  fromSubWarehouseName: string;
  toSubWarehouseId: string;
  toSubWarehouseName: string;
  itemName: string;
  itemSpec: string | null;
  unit: string;
  quantity: number;
  operatorName: string;
  note: string | null;
  createdAt: number;
}

export interface StatsOverviewDto {
  range: { start: string; end: string; period: StatsPeriod };
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

const pick = <T extends string>(
  value: string,
  allowed: readonly T[],
  fallback: T
): T => {
  for (const candidate of allowed) {
    if (candidate === value) {
      return candidate;
    }
  }

  return fallback;
};

export const toRecordStatus = (value: string): RecordStatus =>
  pick(value, RECORD_STATUS_VALUES, "pending_acceptance");

const toMs = (value: Date | null): number | null =>
  value === null ? null : value.getTime();

const requireMs = (value: Date): number => value.getTime();

export const toProfileDto = (
  profile: UserRow,
  teamName: string | null
): ProfileDto => ({
  email: profile.email,
  id: profile.id,
  name: profile.name,
  phone: profile.phone,
  role: pick(profile.role, ROLE_VALUES, "member"),
  status: pick(profile.status, USER_STATUS_VALUES, "active"),
  teamId: profile.teamId,
  teamName,
  username: profile.username ?? "",
});

export const toTeamDto = (
  row: TeamRow,
  memberCount: number,
  matterCount: number
): TeamDto => ({
  code: row.code,
  createdAt: requireMs(row.createdAt),
  description: row.description,
  id: row.id,
  matterCount,
  memberCount,
  name: row.name,
  status: pick(row.status, TEAM_STATUS_VALUES, "active"),
  timezone: row.timezone,
});

export const toMatterDto = (
  row: MatterRow,
  teamName: string,
  itemCount: number,
  todayStatus: RecordStatus | null
): MatterDto => ({
  code: row.code,
  createdAt: requireMs(row.createdAt),
  description: row.description,
  id: row.id,
  itemCount,
  name: row.name,
  qrChangedAt: toMs(row.qrChangedAt),
  qrToken: row.qrToken,
  qrVersion: row.qrVersion,
  status: pick(row.status, MATTER_STATUS_VALUES, "active"),
  teamId: row.teamId,
  teamName,
  todayStatus,
});

export const toItemDto = (row: ItemRow, subWarehouseName: string): ItemDto => ({
  category: row.category,
  createdAt: requireMs(row.createdAt),
  id: row.id,
  location: row.location,
  lowStock: row.stock <= row.minStock,
  matterId: row.matterId,
  minStock: row.minStock,
  name: row.name,
  note: row.note,
  spec: row.spec,
  status: pick(row.status, ITEM_STATUS_VALUES, "active"),
  stock: row.stock,
  subWarehouseId: row.subWarehouseId,
  subWarehouseName,
  unit: row.unit,
});

const toRecordItemDto = (row: RecordItemRow): RecordItemDto => ({
  acceptedAt: toMs(row.acceptedAt),
  actualQty: row.actualQty,
  checked: row.checked,
  expectedQty: row.expectedQty,
  handoverActualQty: row.handoverActualQty,
  handoverChecked: row.handoverChecked,
  handoverNote: row.handoverNote,
  itemId: row.itemId,
  itemName: row.itemName,
  itemSpec: row.itemSpec,
  note: row.note,
  unit: row.unit,
});

export const toRecordSummaryDto = (
  row: RecordRow,
  matterName: string,
  subWarehouseName: string,
  itemCount: number,
  diffCount: number,
  usageCount: number
): RecordSummaryDto => ({
  acceptedAt: toMs(row.acceptedAt),
  acceptedByName: row.acceptedByName,
  diffCount,
  handoverAt: toMs(row.handoverAt),
  handoverByName: row.handoverByName,
  id: row.id,
  itemCount,
  matterId: row.matterId,
  matterName,
  recordDate: row.recordDate,
  subWarehouseId: row.subWarehouseId,
  subWarehouseName,
  status: toRecordStatus(row.status),
  usageCount,
});

export interface RecordDetailExtras {
  items: RecordItemRow[];
  usages: UsageDto[];
  exceptions: ExceptionDto[];
  revokeRequests: RevokeRequestDto[];
  permissions: RecordPermissions;
}

export const toRecordDetailDto = (
  summary: RecordSummaryDto,
  record: RecordRow,
  extras: RecordDetailExtras
): RecordDetailDto => ({
  ...summary,
  acceptanceNote: record.acceptanceNote,
  exceptions: extras.exceptions,
  handoverNote: record.handoverNote,
  items: extras.items.map(toRecordItemDto),
  permissions: extras.permissions,
  revokeRequests: extras.revokeRequests,
  usages: extras.usages,
});

const toUsageItemDto = (
  row: UsageItemRow,
  sourceSubWarehouseName: string
): UsageItemDto => ({
  itemId: row.itemId,
  itemName: row.itemName,
  itemSpec: row.itemSpec,
  quantity: row.quantity,
  sourceSubWarehouseName,
  unit: row.unit,
});

export const toRevokeRequestDto = (row: RevokeRow): RevokeRequestDto => ({
  id: row.id,
  reason: row.reason,
  requestedAt: requireMs(row.createdAt),
  requestedByName: row.requestedByName,
  reviewNote: row.reviewNote,
  reviewedAt: toMs(row.reviewedAt),
  reviewedByName: row.reviewedByName,
  status: pick(row.status, REVOKE_STATUS_VALUES, "pending"),
  usageId: row.usageId,
});

export const toUsageDto = (
  row: UsageRow,
  matterName: string,
  subWarehouseName: string,
  items: { row: UsageItemRow; sourceSubWarehouseName: string }[],
  latestRevoke: RevokeRow | null
): UsageDto => ({
  createdAt: requireMs(row.createdAt),
  id: row.id,
  items: items.map((itemRow) =>
    toUsageItemDto(itemRow.row, itemRow.sourceSubWarehouseName)
  ),
  matterId: row.matterId,
  matterName,
  subWarehouseId: row.subWarehouseId,
  subWarehouseName,
  note: row.note,
  backfillReason: row.backfillReason,
  isBackfill: row.isBackfill,
  operatorName: row.operatorName,
  patientName: row.patientName,
  patientNo: row.patientNo,
  patientPhone: row.patientPhone,
  patientType: pick(row.patientType, PATIENT_TYPE_VALUES, "outpatient"),
  recordId: row.recordId,
  usedAt: row.usedAt,
  usedAtTime: row.usedAtTime,
  revokeRequest:
    latestRevoke === null ? null : toRevokeRequestDto(latestRevoke),
  status: pick(row.status, USAGE_STATUS_VALUES, "active"),
  totalQuantity: items.reduce((sum, line) => sum + line.row.quantity, 0),
});

export const toExceptionDto = (
  row: ExceptionRow,
  matterName: string
): ExceptionDto => ({
  description: row.description,
  id: row.id,
  itemId: row.itemId,
  matterId: row.matterId,
  matterName,
  recordId: row.recordId,
  reportedAt: requireMs(row.createdAt),
  reportedByName: row.reportedByName,
  resolution: row.resolution,
  resolvedAt: toMs(row.resolvedAt),
  resolvedByName: row.resolvedByName,
  severity: pick(row.severity, EXCEPTION_SEVERITY_VALUES, "medium"),
  status: pick(row.status, EXCEPTION_STATUS_VALUES, "open"),
  type: pick(row.type, EXCEPTION_TYPE_VALUES, "other"),
});

export const toStockMovementDto = (row: MovementRow): StockMovementDto => ({
  createdAt: requireMs(row.createdAt),
  id: row.id,
  note: row.note,
  operatorName: row.operatorName,
  quantityDelta: row.quantityDelta,
  refId: row.refId,
  refType: row.refType,
  stockAfter: row.stockAfter,
  subWarehouseId: row.subWarehouseId,
  type: pick(row.type, MOVEMENT_TYPE_VALUES, "adjustment"),
});

export const toSubWarehouseDto = (
  row: SubWarehouseRow,
  itemCount: number,
  totalStock: number
): SubWarehouseDto => ({
  code: row.code,
  createdAt: requireMs(row.createdAt),
  description: row.description,
  id: row.id,
  itemCount,
  location: row.location,
  matterId: row.matterId,
  name: row.name,
  sortOrder: row.sortOrder,
  status: pick(row.status, SUB_WAREHOUSE_STATUS_VALUES, "active"),
  totalStock,
});

export const toStockTransferDto = (
  row: StockTransferRow,
  fromSubWarehouseName: string,
  toSubWarehouseName: string
): StockTransferDto => ({
  createdAt: requireMs(row.createdAt),
  fromSubWarehouseId: row.fromSubWarehouseId,
  fromSubWarehouseName,
  id: row.id,
  itemName: row.itemName,
  itemSpec: row.itemSpec,
  matterId: row.matterId,
  note: row.note,
  operatorName: row.operatorName,
  quantity: row.quantity,
  toSubWarehouseId: row.toSubWarehouseId,
  toSubWarehouseName,
  unit: row.unit,
});
