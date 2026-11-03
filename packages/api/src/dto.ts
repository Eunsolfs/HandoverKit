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

export interface ItemDto {
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
  itemName: string;
  itemSpec: string | null;
  unit: string;
  quantity: number;
}

export interface UsageDto {
  id: string;
  matterId: string;
  matterName: string;
  recordId: string | null;
  usedAt: string;
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
  type: StockMovementType;
  quantityDelta: number;
  stockAfter: number;
  operatorName: string;
  refType: string | null;
  refId: string | null;
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

export const toItemDto = (row: ItemRow): ItemDto => ({
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

const toUsageItemDto = (row: UsageItemRow): UsageItemDto => ({
  itemId: row.itemId,
  itemName: row.itemName,
  itemSpec: row.itemSpec,
  quantity: row.quantity,
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
  items: UsageItemRow[],
  latestRevoke: RevokeRow | null
): UsageDto => ({
  createdAt: requireMs(row.createdAt),
  id: row.id,
  items: items.map(toUsageItemDto),
  matterId: row.matterId,
  matterName,
  note: row.note,
  operatorName: row.operatorName,
  patientName: row.patientName,
  patientNo: row.patientNo,
  patientPhone: row.patientPhone,
  patientType: pick(row.patientType, PATIENT_TYPE_VALUES, "outpatient"),
  recordId: row.recordId,
  revokeRequest:
    latestRevoke === null ? null : toRevokeRequestDto(latestRevoke),
  status: pick(row.status, USAGE_STATUS_VALUES, "active"),
  totalQuantity: items.reduce((sum, line) => sum + line.quantity, 0),
  usedAt: row.usedAt,
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
  type: pick(row.type, MOVEMENT_TYPE_VALUES, "adjustment"),
});
