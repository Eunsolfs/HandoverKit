import { and, count, desc, eq, inArray, ne, or } from "drizzle-orm";

import type { Database } from "@handoverkit/db";
import { user } from "@handoverkit/db/schema/auth";
import {
  exceptionEvent,
  handoverRecord,
  handoverRecordItem,
  item,
  subWarehouse,
  matter,
  revokeRequest,
  team,
  usageItem,
  usageRecord,
} from "@handoverkit/db/schema/handover";

import { isAdmin } from "#src/authz.ts";
import type { Profile } from "#src/context.ts";
import {
  toExceptionDto,
  toMatterDto,
  toProfileDto,
  toRecordDetailDto,
  toRecordStatus,
  toRecordSummaryDto,
  toRevokeRequestDto,
  toTeamDto,
  toUsageDto,
} from "#src/dto.ts";
import type {
  ExceptionDto,
  MatterDto,
  ProfileDto,
  RecordDetailDto,
  RecordStatus,
  RecordSummaryDto,
  TeamDto,
  UsageDto,
} from "#src/dto.ts";

type UserRow = typeof user.$inferSelect;

type TeamRow = typeof team.$inferSelect;

type MatterRow = typeof matter.$inferSelect;

type RecordRow = typeof handoverRecord.$inferSelect;

type RecordItemRow = typeof handoverRecordItem.$inferSelect;

type UsageRow = typeof usageRecord.$inferSelect;

type UsageItemRow = typeof usageItem.$inferSelect;

type RevokeRow = typeof revokeRequest.$inferSelect;

type ExceptionRow = typeof exceptionEvent.$inferSelect;

const toCountMap = <K>(rows: { key: K; value: number }[]): Map<K, number> => {
  const map = new Map<K, number>();

  for (const row of rows) {
    map.set(row.key, row.value);
  }

  return map;
};

const usageCount = (
  db: Database,
  matterId: string,
  subWarehouseId: string,
  recordDate: string
) =>
  db
    .select({ value: count() })
    .from(usageRecord)
    .where(
      and(
        eq(usageRecord.matterId, matterId),
        eq(usageRecord.subWarehouseId, subWarehouseId),
        eq(usageRecord.usedAt, recordDate)
      )
    )
    .all()[0]?.value ?? 0;

export const loadTeamRow = (
  db: Database,
  teamId: string
): TeamRow | undefined =>
  db.select().from(team).where(eq(team.id, teamId)).all()[0];

export const loadTeamDto = (db: Database, row: TeamRow): TeamDto => {
  const memberCount =
    db
      .select({ value: count() })
      .from(user)
      .where(eq(user.teamId, row.id))
      .all()[0]?.value ?? 0;

  const matterCount =
    db
      .select({ value: count() })
      .from(matter)
      .where(eq(matter.teamId, row.id))
      .all()[0]?.value ?? 0;

  return toTeamDto(row, memberCount, matterCount);
};

export const loadTeamDtos = (db: Database, rows: TeamRow[]): TeamDto[] =>
  rows.map((row) => loadTeamDto(db, row));

const loadTeamNameMap = (
  db: Database,
  teamIds: string[]
): Map<string, string> => {
  if (teamIds.length === 0) {
    return new Map();
  }

  const rows = db
    .select({ id: team.id, name: team.name })
    .from(team)
    .where(inArray(team.id, teamIds))
    .all();

  return new Map(rows.map((row) => [row.id, row.name]));
};

export const loadProfileDtos = (
  db: Database,
  profiles: UserRow[]
): ProfileDto[] => {
  const teamIds: string[] = [];

  for (const profile of profiles) {
    if (profile.teamId !== null && !teamIds.includes(profile.teamId)) {
      teamIds.push(profile.teamId);
    }
  }

  const teamNames = loadTeamNameMap(db, teamIds);

  return profiles.map((profile) =>
    toProfileDto(
      profile,
      profile.teamId === null ? null : (teamNames.get(profile.teamId) ?? null)
    )
  );
};

const loadSubWarehouseNames = (
  db: Database,
  ids: string[]
): Map<string, string> => {
  if (ids.length === 0) {
    return new Map();
  }

  const rows = db
    .select({ id: subWarehouse.id, name: subWarehouse.name })
    .from(subWarehouse)
    .where(inArray(subWarehouse.id, ids))
    .all();

  return new Map(rows.map((row) => [row.id, row.name]));
};

const loadMatterNames = (
  db: Database,
  matterIds: string[]
): Map<string, string> => {
  if (matterIds.length === 0) {
    return new Map();
  }

  const rows = db
    .select({ id: matter.id, name: matter.name })
    .from(matter)
    .where(inArray(matter.id, matterIds))
    .all();

  return new Map(rows.map((row) => [row.id, row.name]));
};

export const loadMatterDtos = (
  db: Database,
  rows: MatterRow[],
  recordDate: string
): MatterDto[] => {
  if (rows.length === 0) {
    return [];
  }

  const teamIds: string[] = [];
  const matterIds: string[] = [];

  for (const row of rows) {
    if (!teamIds.includes(row.teamId)) {
      teamIds.push(row.teamId);
    }

    matterIds.push(row.id);
  }

  const teamNames = loadTeamNameMap(db, teamIds);

  const itemCounts = toCountMap(
    db
      .select({ key: item.matterId, value: count() })
      .from(item)
      .where(and(inArray(item.matterId, matterIds), eq(item.status, "active")))
      .groupBy(item.matterId)
      .all()
  );

  const statusRows = db
    .select({
      matterId: handoverRecord.matterId,
      status: handoverRecord.status,
    })
    .from(handoverRecord)
    .where(
      and(
        inArray(handoverRecord.matterId, matterIds),
        eq(handoverRecord.recordDate, recordDate)
      )
    )
    .all();

  const statusMap = new Map<string, RecordStatus>();

  const priority: Record<RecordStatus, number> = {
    accepted: 1,
    handover_submitted: 2,
    pending_acceptance: 0,
  };

  for (const row of statusRows) {
    const next = toRecordStatus(row.status);
    const current = statusMap.get(row.matterId);

    if (current === undefined || priority[next] < priority[current]) {
      statusMap.set(row.matterId, next);
    }
  }

  return rows.map((row) =>
    toMatterDto(
      row,
      teamNames.get(row.teamId) ?? "",
      itemCounts.get(row.id) ?? 0,
      statusMap.get(row.id) ?? null
    )
  );
};

export const loadMatterDto = (
  db: Database,
  row: MatterRow,
  recordDate: string
): MatterDto => {
  const [dto] = loadMatterDtos(db, [row], recordDate);

  if (dto === undefined) {
    throw new Error("交接事项映射失败");
  }

  return dto;
};

interface UsageItemWithSource {
  row: UsageItemRow;
  sourceSubWarehouseName: string;
}

const groupUsageItemsWithSource = (
  rows: UsageItemWithSource[]
): Map<string, UsageItemWithSource[]> => {
  const map = new Map<string, UsageItemWithSource[]>();

  for (const row of rows) {
    const bucket = map.get(row.row.usageId);

    if (bucket === undefined) {
      map.set(row.row.usageId, [row]);
    } else {
      bucket.push(row);
    }
  }

  return map;
};

const latestRevokeByUsage = (rows: RevokeRow[]): Map<string, RevokeRow> => {
  const map = new Map<string, RevokeRow>();

  for (const row of rows) {
    map.set(row.usageId, row);
  }

  return map;
};

export const loadUsageDtos = (db: Database, rows: UsageRow[]): UsageDto[] => {
  if (rows.length === 0) {
    return [];
  }

  const usageIds: string[] = [];
  const matterIds: string[] = [];

  for (const row of rows) {
    usageIds.push(row.id);

    if (!matterIds.includes(row.matterId)) {
      matterIds.push(row.matterId);
    }
  }

  const matterNames = loadMatterNames(db, matterIds);
  const subWarehouseIds: string[] = [];

  for (const row of rows) {
    if (!subWarehouseIds.includes(row.subWarehouseId)) {
      subWarehouseIds.push(row.subWarehouseId);
    }
  }

  const subWarehouseNames = loadSubWarehouseNames(db, subWarehouseIds);

  const itemRows = db
    .select({
      row: usageItem,
      sourceSubWarehouseName: subWarehouse.name,
    })
    .from(usageItem)
    .innerJoin(item, eq(usageItem.itemId, item.id))
    .innerJoin(subWarehouse, eq(item.subWarehouseId, subWarehouse.id))
    .where(inArray(usageItem.usageId, usageIds))
    .all();

  const itemsByUsage = groupUsageItemsWithSource(itemRows);

  const latestRevokes = latestRevokeByUsage(
    db
      .select()
      .from(revokeRequest)
      .where(inArray(revokeRequest.usageId, usageIds))
      .orderBy(revokeRequest.createdAt)
      .all()
  );

  return rows.map((row) =>
    toUsageDto(
      row,
      matterNames.get(row.matterId) ?? "",
      subWarehouseNames.get(row.subWarehouseId) ?? "",
      itemsByUsage.get(row.id) ?? [],
      latestRevokes.get(row.id) ?? null
    )
  );
};

export const loadUsageDto = (db: Database, row: UsageRow): UsageDto => {
  const [dto] = loadUsageDtos(db, [row]);

  if (dto === undefined) {
    throw new Error("用物记录映射失败");
  }

  return dto;
};

export const loadExceptionDtos = (
  db: Database,
  rows: ExceptionRow[]
): ExceptionDto[] => {
  if (rows.length === 0) {
    return [];
  }

  const matterIds: string[] = [];

  for (const row of rows) {
    if (!matterIds.includes(row.matterId)) {
      matterIds.push(row.matterId);
    }
  }

  const matterNames = loadMatterNames(db, matterIds);

  return rows.map((row) =>
    toExceptionDto(row, matterNames.get(row.matterId) ?? "")
  );
};

const isDiffItem = (row: RecordItemRow): boolean => {
  const acceptDiff =
    row.actualQty !== null && row.actualQty !== row.expectedQty;

  const handoverDiff =
    row.handoverActualQty !== null && row.handoverActualQty !== row.expectedQty;

  return acceptDiff || handoverDiff;
};

export const loadRecordSummaries = (
  db: Database,
  rows: RecordRow[]
): RecordSummaryDto[] => {
  if (rows.length === 0) {
    return [];
  }

  const recordIds: string[] = [];
  const matterIds: string[] = [];
  const subWarehouseIds: string[] = [];
  const pairConditions = [];

  for (const row of rows) {
    recordIds.push(row.id);

    if (!matterIds.includes(row.matterId)) {
      matterIds.push(row.matterId);
    }

    if (!subWarehouseIds.includes(row.subWarehouseId)) {
      subWarehouseIds.push(row.subWarehouseId);
    }

    pairConditions.push(
      and(
        eq(usageRecord.subWarehouseId, row.subWarehouseId),
        eq(usageRecord.usedAt, row.recordDate)
      )
    );
  }

  const matterNames = loadMatterNames(db, matterIds);
  const subWarehouseNames = loadSubWarehouseNames(db, subWarehouseIds);

  const itemCounts = toCountMap(
    db
      .select({ key: handoverRecordItem.recordId, value: count() })
      .from(handoverRecordItem)
      .where(inArray(handoverRecordItem.recordId, recordIds))
      .groupBy(handoverRecordItem.recordId)
      .all()
  );

  const diffCounts = toCountMap(
    db
      .select({ key: handoverRecordItem.recordId, value: count() })
      .from(handoverRecordItem)
      .where(
        and(
          inArray(handoverRecordItem.recordId, recordIds),
          or(
            ne(handoverRecordItem.actualQty, handoverRecordItem.expectedQty),
            ne(
              handoverRecordItem.handoverActualQty,
              handoverRecordItem.expectedQty
            )
          )
        )
      )
      .groupBy(handoverRecordItem.recordId)
      .all()
  );

  const usageCountRows = db
    .select({
      key: usageRecord.subWarehouseId,
      usedAt: usageRecord.usedAt,
      value: count(),
    })
    .from(usageRecord)
    .where(or(...pairConditions))
    .groupBy(usageRecord.subWarehouseId, usageRecord.usedAt)
    .all();

  const usageCounts = new Map<string, number>();

  for (const row of usageCountRows) {
    usageCounts.set(`${row.key}|${row.usedAt}`, row.value);
  }

  return rows.map((row) =>
    toRecordSummaryDto(
      row,
      matterNames.get(row.matterId) ?? "",
      subWarehouseNames.get(row.subWarehouseId) ?? "",
      itemCounts.get(row.id) ?? 0,
      diffCounts.get(row.id) ?? 0,
      usageCounts.get(`${row.subWarehouseId}|${row.recordDate}`) ??
        usageCount(db, row.matterId, row.subWarehouseId, row.recordDate)
    )
  );
};

export const loadRecordDetail = (
  db: Database,
  profile: Profile,
  row: RecordRow
): RecordDetailDto => {
  const matterNames = loadMatterNames(db, [row.matterId]);

  const subWarehouseName =
    loadSubWarehouseNames(db, [row.subWarehouseId]).get(row.subWarehouseId) ??
    "";

  const items = db
    .select()
    .from(handoverRecordItem)
    .where(eq(handoverRecordItem.recordId, row.id))
    .all();

  const itemImageRows = db
    .select({ id: item.id, imageUpdatedAt: item.imageUpdatedAt })
    .from(item)
    .where(
      inArray(
        item.id,
        items.map((itemRow) => itemRow.itemId)
      )
    )
    .all();

  const itemImageUrlById = new Map(
    itemImageRows.map((imageRow) => [
      imageRow.id,
      imageRow.imageUpdatedAt === null
        ? null
        : `/api/items/${imageRow.id}/image?v=${imageRow.imageUpdatedAt.getTime()}`,
    ])
  );

  const usageRows = db
    .select()
    .from(usageRecord)
    .where(
      and(
        eq(usageRecord.matterId, row.matterId),
        eq(usageRecord.subWarehouseId, row.subWarehouseId),
        eq(usageRecord.usedAt, row.recordDate)
      )
    )
    .orderBy(desc(usageRecord.createdAt))
    .all();

  const usageIds: string[] = [];

  for (const usage of usageRows) {
    usageIds.push(usage.id);
  }

  const revokeRows =
    usageIds.length === 0
      ? []
      : db
          .select()
          .from(revokeRequest)
          .where(inArray(revokeRequest.usageId, usageIds))
          .orderBy(revokeRequest.createdAt)
          .all();

  const exceptionRows = db
    .select()
    .from(exceptionEvent)
    .where(eq(exceptionEvent.recordId, row.id))
    .orderBy(desc(exceptionEvent.createdAt))
    .all();

  const diffCount = items.reduce(
    (total, itemRow) => total + (isDiffItem(itemRow) ? 1 : 0),
    0
  );

  const acceptanceDiffCount = items.reduce(
    (total, itemRow) =>
      total +
      (itemRow.actualQty !== null && itemRow.actualQty !== itemRow.expectedQty
        ? 1
        : 0),
    0
  );

  const requiresExceptionReport =
    acceptanceDiffCount > 0 && exceptionRows.length === 0;

  const canRegisterUsage =
    row.status === "accepted" && !requiresExceptionReport;

  const summary = toRecordSummaryDto(
    row,
    matterNames.get(row.matterId) ?? "",
    subWarehouseName,
    items.length,
    diffCount,
    usageRows.length
  );

  return toRecordDetailDto(summary, row, {
    exceptions: loadExceptionDtos(db, exceptionRows),
    items: items.map((itemRow) => ({
      imageUrl: itemImageUrlById.get(itemRow.itemId) ?? null,
      row: itemRow,
    })),
    permissions: {
      canAccept: row.status === "pending_acceptance",
      canDelete: isAdmin(profile) && usageRows.length === 0,
      canHandover: row.status === "accepted" && !requiresExceptionReport,
      canRegisterUsage,
      requiresExceptionReport,
    },
    revokeRequests: revokeRows.map(toRevokeRequestDto),
    usages: loadUsageDtos(db, usageRows),
  });
};
