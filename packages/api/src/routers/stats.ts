import { and, count, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@handoverkit/db";
import {
  exceptionEvent,
  handoverRecord,
  item,
  matter,
  revokeRequest,
  usageItem,
  usageRecord,
} from "@handoverkit/db/schema/handover";

import { assertMatterAccess, resolveTeamId } from "#src/authz.ts";
import type { StatsOverviewDto } from "#src/dto.ts";
import {
  calendarDateSchema,
  daysInRange,
  periodRange,
  todayInTimeZone,
} from "#src/lib/dates.ts";
import type { DateRange, StatsPeriod } from "#src/lib/dates.ts";
import { loadTeamRow } from "#src/lib/loaders.ts";
import { adminProcedure } from "#src/procedures.ts";

/** 待审批撤销尚未生效，与 active 同样计入消耗；只有批准的 revoked 排除。 */
const countedStatuses = ["active", "revoke_pending"];
const countedUsage = inArray(usageRecord.status, countedStatuses);

const sumQuantity = sql<number>`coalesce(sum(${usageItem.quantity}), 0)`;
const countUsages = sql<number>`count(distinct ${usageRecord.id})`;

const shareOf = (quantity: number, total: number): number =>
  total === 0 ? 0 : Math.round((quantity / total) * 10_000) / 10_000;

const matterScope = (teamId: string, matterId?: string) => [
  eq(matter.teamId, teamId),
  ...(matterId === undefined ? [] : [eq(usageRecord.matterId, matterId)]),
];

const loadRangeTotals = (
  db: Database,
  range: DateRange,
  teamId: string,
  matterId?: string
) =>
  db
    .select({
      itemKinds: sql<number>`count(distinct ${usageItem.itemId})`,
      quantity: sumQuantity,
      usageCount: countUsages,
    })
    .from(usageRecord)
    .innerJoin(matter, eq(usageRecord.matterId, matter.id))
    .innerJoin(usageItem, eq(usageItem.usageId, usageRecord.id))
    .where(
      and(
        countedUsage,
        gte(usageRecord.usedAt, range.start),
        lte(usageRecord.usedAt, range.end),
        ...matterScope(teamId, matterId)
      )
    )
    .all()[0];

const patientTypeTotals = (
  db: Database,
  range: DateRange,
  teamId: string,
  matterId?: string
) => {
  const rows = db
    .select({
      patientType: usageRecord.patientType,
      quantity: sumQuantity,
    })
    .from(usageRecord)
    .innerJoin(matter, eq(usageRecord.matterId, matter.id))
    .innerJoin(usageItem, eq(usageItem.usageId, usageRecord.id))
    .where(
      and(
        countedUsage,
        gte(usageRecord.usedAt, range.start),
        lte(usageRecord.usedAt, range.end),
        ...matterScope(teamId, matterId)
      )
    )
    .groupBy(usageRecord.patientType)
    .all();

  const totals = { inpatient: 0, outpatient: 0 };

  for (const row of rows) {
    if (row.patientType === "inpatient") {
      totals.inpatient = row.quantity;
    } else {
      totals.outpatient = row.quantity;
    }
  }

  return totals;
};

const loadAlerts = (
  db: Database,
  teamId: string
): StatsOverviewDto["alerts"] => {
  const pendingRevocations =
    db
      .select({ value: count() })
      .from(revokeRequest)
      .innerJoin(usageRecord, eq(revokeRequest.usageId, usageRecord.id))
      .innerJoin(matter, eq(usageRecord.matterId, matter.id))
      .where(
        and(eq(matter.teamId, teamId), eq(revokeRequest.status, "pending"))
      )
      .all()[0]?.value ?? 0;

  const openExceptions =
    db
      .select({ value: count() })
      .from(exceptionEvent)
      .innerJoin(matter, eq(exceptionEvent.matterId, matter.id))
      .where(and(eq(matter.teamId, teamId), eq(exceptionEvent.status, "open")))
      .all()[0]?.value ?? 0;

  const lowStockItems = db
    .select({
      itemId: item.id,
      itemName: item.name,
      minStock: item.minStock,
      stock: item.stock,
    })
    .from(item)
    .innerJoin(matter, eq(item.matterId, matter.id))
    .where(
      and(
        eq(matter.teamId, teamId),
        eq(item.status, "active"),
        sql`${item.stock} <= ${item.minStock}`
      )
    )
    .orderBy(sql`${item.stock} - ${item.minStock}`)
    .limit(20)
    .all();

  return { lowStockItems, openExceptions, pendingRevocations };
};

export const statsRouter = {
  overview: adminProcedure
    .input(
      z.object({
        anchorDate: calendarDateSchema.optional(),
        matterId: z.string().min(1).optional(),
        period: z.enum(["week", "month", "year"]),
        teamId: z.string().min(1).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const matterAccess =
        input.matterId === undefined
          ? null
          : await assertMatterAccess(context.db, context.user, input.matterId);

      const teamId =
        matterAccess === null
          ? await resolveTeamId(context.db, context.user, input.teamId)
          : matterAccess.teamId;

      const teamRow = loadTeamRow(context.db, teamId);

      const anchorDate =
        input.anchorDate ??
        todayInTimeZone(teamRow?.timezone ?? "Asia/Shanghai");

      const period: StatsPeriod = input.period;
      const range = periodRange(period, anchorDate);

      const matterFilter =
        input.matterId === undefined
          ? []
          : [eq(usageRecord.matterId, input.matterId)];

      const usageWhere = and(
        eq(matter.teamId, teamId),
        countedUsage,
        gte(usageRecord.usedAt, range.start),
        lte(usageRecord.usedAt, range.end),
        ...matterFilter
      );

      const totalsRow = loadRangeTotals(
        context.db,
        range,
        teamId,
        input.matterId
      );

      const totalQuantity = totalsRow?.quantity ?? 0;

      const byItemRows = context.db
        .select({
          itemId: usageItem.itemId,
          itemName: item.name,
          quantity: sumQuantity,
          spec: item.spec,
          unit: item.unit,
          usageCount: countUsages,
        })
        .from(usageRecord)
        .innerJoin(matter, eq(usageRecord.matterId, matter.id))
        .innerJoin(usageItem, eq(usageItem.usageId, usageRecord.id))
        .innerJoin(item, eq(item.id, usageItem.itemId))
        .where(
          and(
            eq(matter.teamId, teamId),
            countedUsage,
            gte(usageRecord.usedAt, range.start),
            lte(usageRecord.usedAt, range.end),
            ...(input.matterId === undefined
              ? []
              : [eq(usageRecord.matterId, input.matterId)])
          )
        )
        .groupBy(usageItem.itemId, item.name, item.spec, item.unit)
        .orderBy(desc(sql`sum(${usageItem.quantity})`))
        .all();

      const byDayRows = context.db
        .select({
          date: usageRecord.usedAt,
          quantity: sumQuantity,
          usageCount: countUsages,
        })
        .from(usageRecord)
        .innerJoin(matter, eq(usageRecord.matterId, matter.id))
        .innerJoin(usageItem, eq(usageItem.usageId, usageRecord.id))
        .where(usageWhere)
        .groupBy(usageRecord.usedAt)
        .all();

      const byDayMap = new Map<
        string,
        { date: string; quantity: number; usageCount: number }
      >();

      for (const row of byDayRows) {
        byDayMap.set(row.date, row);
      }

      const recordConditions = [
        eq(matter.teamId, teamId),
        gte(handoverRecord.recordDate, range.start),
        lte(handoverRecord.recordDate, range.end),
        ...(input.matterId === undefined
          ? []
          : [eq(handoverRecord.matterId, input.matterId)]),
      ];

      const recordCount =
        context.db
          .select({ value: count() })
          .from(handoverRecord)
          .innerJoin(matter, eq(handoverRecord.matterId, matter.id))
          .where(and(...recordConditions))
          .all()[0]?.value ?? 0;

      const acceptedCount =
        context.db
          .select({ value: count() })
          .from(handoverRecord)
          .innerJoin(matter, eq(handoverRecord.matterId, matter.id))
          .where(
            and(
              ...recordConditions,
              ne(handoverRecord.status, "pending_acceptance")
            )
          )
          .all()[0]?.value ?? 0;

      return {
        alerts: loadAlerts(context.db, teamId),
        byDay: daysInRange(range).map(
          (date) => byDayMap.get(date) ?? { date, quantity: 0, usageCount: 0 }
        ),
        byItem: byItemRows.map((row) => ({
          itemId: row.itemId,
          itemName: row.itemName,
          quantity: row.quantity,
          share: shareOf(row.quantity, totalQuantity),
          spec: row.spec,
          unit: row.unit,
          usageCount: row.usageCount,
        })),
        byPatientType: patientTypeTotals(
          context.db,
          range,
          teamId,
          input.matterId
        ),
        range: { end: range.end, period, start: range.start },
        totals: {
          acceptedCount,
          itemKinds: totalsRow?.itemKinds ?? 0,
          quantity: totalQuantity,
          recordCount,
          usageCount: totalsRow?.usageCount ?? 0,
        },
      };
    }),
};
