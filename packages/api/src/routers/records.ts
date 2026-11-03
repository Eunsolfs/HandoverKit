import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@handoverkit/db";
import {
  handoverRecord,
  handoverRecordItem,
  matter,
  usageRecord,
} from "@handoverkit/db/schema/handover";

import {
  assertMatterAccess,
  assertMatterActive,
  resolveTeamId,
} from "#src/authz.ts";
import type { Profile } from "#src/context.ts";
import {
  calendarDateSchema,
  periodRange,
  todayInTimeZone,
} from "#src/lib/dates.ts";
import type { DateRange } from "#src/lib/dates.ts";
import {
  loadRecordDetail,
  loadRecordSummaries,
  loadTeamRow,
} from "#src/lib/loaders.ts";
import { ensureRecord } from "#src/lib/records.ts";
import { adminProcedure, protectedProcedure } from "#src/procedures.ts";

type RecordRow = typeof handoverRecord.$inferSelect;

type RecordItemRow = typeof handoverRecordItem.$inferSelect;

const checklistItemSchema = z.object({
  actualQty: z.number().int().min(0).nullish(),
  checked: z.boolean(),
  itemId: z.string().min(1),
  note: z.string().trim().max(300).nullish(),
});

const checklistSchema = z.array(checklistItemSchema);

const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

const loadRecordRow = (db: Database, id: string): RecordRow | undefined =>
  db.select().from(handoverRecord).where(eq(handoverRecord.id, id)).all()[0];

const requireRecordRow = (db: Database, id: string): RecordRow => {
  const row = loadRecordRow(db, id);

  if (row === undefined) {
    throw new ORPCError("NOT_FOUND", { message: "交接记录不存在" });
  }

  return row;
};

const requireRecordInScope = async (
  db: Database,
  profile: Profile,
  id: string
): Promise<RecordRow> => {
  const row = requireRecordRow(db, id);

  await assertMatterAccess(db, profile, row.matterId);

  return row;
};

interface ResolvedChecklistLine {
  row: RecordItemRow;
  actualQty: number | null;
  note: string | null;
  mismatch: boolean;
}

const resolveChecklist = (
  recordItems: RecordItemRow[],
  lines: z.infer<typeof checklistSchema>
): ResolvedChecklistLine[] => {
  const lineMap = new Map<string, z.infer<typeof checklistItemSchema>>();

  for (const line of lines) {
    if (lineMap.has(line.itemId)) {
      throw new ORPCError("BAD_REQUEST", {
        message: "清单项重复，请刷新后重试",
      });
    }

    lineMap.set(line.itemId, line);
  }

  if (lineMap.size !== recordItems.length) {
    throw new ORPCError("BAD_REQUEST", { message: "请核对全部清单项" });
  }

  const resolved: ResolvedChecklistLine[] = [];

  for (const row of recordItems) {
    const line = lineMap.get(row.itemId);

    if (line === undefined) {
      throw new ORPCError("BAD_REQUEST", {
        message: `请核对清单项：${row.itemName}`,
      });
    }

    if (!line.checked) {
      throw new ORPCError("BAD_REQUEST", {
        message: `请勾选清单项：${row.itemName}`,
      });
    }

    const note = line.note ?? null;

    const actualQty = line.actualQty ?? null;
    const effectiveQty = actualQty ?? row.expectedQty;

    if (effectiveQty !== row.expectedQty && note === null) {
      throw new ORPCError("BAD_REQUEST", {
        message: `实盘数量与应有数量不一致时必须填写备注：${row.itemName}`,
      });
    }

    resolved.push({
      actualQty,
      mismatch: effectiveQty !== row.expectedQty,
      note,
      row,
    });
  }

  return resolved;
};

const loadChecklist = (db: Database, recordId: string): RecordItemRow[] =>
  db
    .select()
    .from(handoverRecordItem)
    .where(eq(handoverRecordItem.recordId, recordId))
    .all();

const statusConflict = (message: string) =>
  new ORPCError("CONFLICT", { message });

export const recordsRouter = {
  accept: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        items: checklistSchema,
        note: z.string().trim().max(500).nullish(),
      })
    )
    .handler(async ({ context, input }) => {
      const row = await requireRecordInScope(
        context.db,
        context.user,
        input.id
      );

      assertMatterActive(
        await assertMatterAccess(context.db, context.user, row.matterId)
      );

      if (row.status !== "pending_acceptance") {
        throw statusConflict("当前记录不是待接收状态");
      }

      const recordItems = loadChecklist(context.db, row.id);
      const lines = resolveChecklist(recordItems, input.items);
      const now = new Date();
      const operatorId = context.user.id;
      const operatorName = context.user.name;

      context.db.transaction((tx) => {
        const changed = tx
          .update(handoverRecord)
          .set({
            acceptedAt: now,
            acceptedByName: operatorName,
            acceptedByUserId: operatorId,
            acceptanceNote: input.note ?? null,
            status: "accepted",
          })
          .where(
            and(
              eq(handoverRecord.id, row.id),
              eq(handoverRecord.status, "pending_acceptance")
            )
          )
          .run();

        if (Number(changed.changes) === 0) {
          throw statusConflict("当前记录不是待接收状态");
        }

        for (const line of lines) {
          tx.update(handoverRecordItem)
            .set({
              acceptedAt: now,
              actualQty: line.actualQty,
              checked: true,
              note: line.note,
            })
            .where(eq(handoverRecordItem.id, line.row.id))
            .run();
        }
      });

      const updated = requireRecordRow(context.db, row.id);

      return loadRecordDetail(context.db, context.user, updated);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const row = await requireRecordInScope(
        context.db,
        context.user,
        input.id
      );

      return loadRecordDetail(context.db, context.user, row);
    }),

  list: protectedProcedure
    .input(
      z
        .object({
          anchorDate: calendarDateSchema.optional(),
          matterId: z.string().min(1).optional(),
          period: z.enum(["day", "week", "month", "year"]).optional(),
          status: z
            .enum(["pending_acceptance", "accepted", "handover_submitted"])
            .optional(),
          teamId: z.string().min(1).optional(),
        })
        .extend(paginationSchema.shape)
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

      let range: DateRange | null = null;

      if (input.period !== undefined) {
        range =
          input.period === "day"
            ? { end: anchorDate, start: anchorDate }
            : periodRange(input.period, anchorDate);
      }

      const conditions = [
        eq(matter.teamId, teamId),
        ...(input.matterId === undefined
          ? []
          : [eq(handoverRecord.matterId, input.matterId)]),
        ...(input.status === undefined
          ? []
          : [eq(handoverRecord.status, input.status)]),
        ...(range === null
          ? []
          : [
              gte(handoverRecord.recordDate, range.start),
              lte(handoverRecord.recordDate, range.end),
            ]),
      ];

      const where = and(...conditions);

      const total =
        context.db
          .select({ value: count() })
          .from(handoverRecord)
          .innerJoin(matter, eq(handoverRecord.matterId, matter.id))
          .where(where)
          .all()[0]?.value ?? 0;

      const rows = context.db
        .select({ record: handoverRecord })
        .from(handoverRecord)
        .innerJoin(matter, eq(handoverRecord.matterId, matter.id))
        .where(where)
        .orderBy(
          desc(handoverRecord.recordDate),
          desc(handoverRecord.createdAt)
        )
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize)
        .all();

      return {
        items: loadRecordSummaries(
          context.db,
          rows.map((row) => row.record)
        ),
        page: input.page,
        pageSize: input.pageSize,
        total,
      };
    }),

  remove: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const row = await requireRecordInScope(
        context.db,
        context.user,
        input.id
      );

      const usageCount =
        context.db
          .select({ value: count() })
          .from(usageRecord)
          .where(
            and(
              eq(usageRecord.matterId, row.matterId),
              eq(usageRecord.usedAt, row.recordDate)
            )
          )
          .all()[0]?.value ?? 0;

      if (usageCount > 0) {
        throw new ORPCError("CONFLICT", {
          message: "该交接记录已有消耗记录，不能删除",
        });
      }

      context.db
        .delete(handoverRecord)
        .where(eq(handoverRecord.id, row.id))
        .run();

      return { ok: true as const };
    }),

  submitHandover: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        items: checklistSchema,
        note: z.string().trim().max(500).nullish(),
      })
    )
    .handler(async ({ context, input }) => {
      const row = await requireRecordInScope(
        context.db,
        context.user,
        input.id
      );

      assertMatterActive(
        await assertMatterAccess(context.db, context.user, row.matterId)
      );

      if (row.status !== "accepted") {
        throw statusConflict("当前记录不是已接收状态，不能提交交班表");
      }

      const recordItems = loadChecklist(context.db, row.id);
      const lines = resolveChecklist(recordItems, input.items);
      const now = new Date();
      const operatorName = context.user.name;

      context.db.transaction((tx) => {
        const changed = tx
          .update(handoverRecord)
          .set({
            handoverAt: now,
            handoverByName: operatorName,
            handoverByUserId: context.user.id,
            handoverNote: input.note ?? null,
            status: "handover_submitted",
          })
          .where(
            and(
              eq(handoverRecord.id, row.id),
              eq(handoverRecord.status, "accepted")
            )
          )
          .run();

        if (Number(changed.changes) === 0) {
          throw statusConflict("当前记录不是已接收状态，不能提交交班表");
        }

        for (const line of lines) {
          tx.update(handoverRecordItem)
            .set({
              handoverActualQty: line.actualQty,
              handoverChecked: true,
              handoverNote: line.note,
            })
            .where(eq(handoverRecordItem.id, line.row.id))
            .run();
        }
      });

      const updated = requireRecordRow(context.db, row.id);

      return loadRecordDetail(context.db, context.user, updated);
    }),

  today: protectedProcedure
    .input(
      z.object({
        date: calendarDateSchema.optional(),
        matterId: z.string().min(1),
      })
    )
    .handler(async ({ context, input }) => {
      const access = await assertMatterAccess(
        context.db,
        context.user,
        input.matterId
      );

      assertMatterActive(access);

      const teamRow = loadTeamRow(context.db, access.teamId);

      const recordDate =
        input.date ?? todayInTimeZone(teamRow?.timezone ?? "Asia/Shanghai");

      const record = ensureRecord(context.db, input.matterId, recordDate);

      return loadRecordDetail(context.db, context.user, record);
    }),
};
