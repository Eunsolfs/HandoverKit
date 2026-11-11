import { randomUUID } from "node:crypto";

import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@handoverkit/db";
import {
  exceptionEvent,
  handoverRecord,
  handoverRecordItem,
  item,
  matter,
  revokeRequest,
  stockMovement,
  subWarehouse,
  usageItem,
  usageRecord,
} from "@handoverkit/db/schema/handover";

import {
  assertMatterAccess,
  assertMatterActive,
  assertTeamAccess,
  resolveSubWarehouseId,
  resolveTeamId,
} from "#src/authz.ts";
import type { Profile } from "#src/context.ts";
import { toRevokeRequestDto } from "#src/dto.ts";
import { calendarDateSchema, todayInTimeZone } from "#src/lib/dates.ts";
import { loadTeamRow, loadUsageDto, loadUsageDtos } from "#src/lib/loaders.ts";
import { adminProcedure, protectedProcedure } from "#src/procedures.ts";

type UsageRow = typeof usageRecord.$inferSelect;

type RevokeRow = typeof revokeRequest.$inferSelect;

const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

const loadUsageRow = (db: Database, id: string): UsageRow | undefined => {
  const [row] = db
    .select()
    .from(usageRecord)
    .where(eq(usageRecord.id, id))
    .all();

  return row;
};

const requireUsageInScope = (
  db: Database,
  profile: Profile,
  id: string
): UsageRow => {
  const [found] = db
    .select({ teamId: matter.teamId, usage: usageRecord })
    .from(usageRecord)
    .innerJoin(matter, eq(usageRecord.matterId, matter.id))
    .where(eq(usageRecord.id, id))
    .all();

  if (found === undefined) {
    throw new ORPCError("NOT_FOUND", { message: "用物记录不存在" });
  }

  assertTeamAccess(profile, found.teamId);

  return found.usage;
};

const requireRevokeRow = (db: Database, id: string): RevokeRow => {
  const [row] = db
    .select()
    .from(revokeRequest)
    .where(eq(revokeRequest.id, id))
    .all();

  if (row === undefined) {
    throw new ORPCError("NOT_FOUND", { message: "撤销申请不存在" });
  }

  return row;
};

const usageConflict = (message: string) =>
  new ORPCError("CONFLICT", { message });

const usageBaseInput = z.object({
  /** 显式允许跨子仓库借用；默认只允许当前登记子仓库的物品。 */
  allowCrossWarehouse: z.boolean().default(false),
  items: z
    .array(
      z.object({
        itemId: z.string().min(1),
        quantity: z.number().int().min(1).max(100_000),
      })
    )
    .min(1),
  matterId: z.string().min(1),
  subWarehouseId: z.string().min(1).optional(),
  note: z.string().trim().max(300).nullish(),
  operatorName: z.string().trim().max(40).optional(),
  patientName: z.string().trim().min(1).max(40),
  // 门诊号/住院号按实际业务可为空；数据库继续存空字符串以保持现有 NOT NULL 结构。
  patientNo: z.string().trim().max(40).default(""),
  patientPhone: z.string().trim().max(20).nullish(),
  patientType: z.enum(["outpatient", "inpatient"]),
  usedAt: calendarDateSchema,
});

interface UsageWriteOptions {
  allowCrossWarehouse: boolean;
  matterId: string;
  subWarehouseId: string;
  items: { itemId: string; quantity: number }[];
  note: string | null;
  operatorName: string | undefined;
  patientName: string;
  patientNo: string;
  patientPhone: string | null;
  patientType: "outpatient" | "inpatient";
  usedAt: string;
  usedAtTime: string | null;
  isBackfill: boolean;
  backfillReason: string | null;
  recordId: string | null;
  movementNote: string | null;
}

/** 普通登记与补登记共用的写入逻辑：校验物品、事务扣库存、写明细与流水。 */
const writeUsage = (
  db: Database,
  user: Profile,
  options: UsageWriteOptions
): string => {
  const usageId = randomUUID();
  const operatorName = options.operatorName ?? user.name;
  const now = new Date();
  const seen = new Set<string>();

  for (const line of options.items) {
    if (seen.has(line.itemId)) {
      throw new ORPCError("BAD_REQUEST", {
        message: "同一物品不能重复登记",
      });
    }

    seen.add(line.itemId);
  }

  db.transaction((tx) => {
    const lines: {
      row: typeof item.$inferSelect;
      quantity: number;
    }[] = [];

    for (const line of options.items) {
      const [itemRow] = tx
        .select()
        .from(item)
        .where(
          and(eq(item.id, line.itemId), eq(item.matterId, options.matterId))
        )
        .all();

      if (itemRow === undefined) {
        throw new ORPCError("NOT_FOUND", { message: "物品不存在" });
      }

      if (itemRow.status !== "active") {
        throw new ORPCError("BAD_REQUEST", {
          message: `物品「${itemRow.name}」已停用，不能登记消耗`,
        });
      }

      if (
        !options.allowCrossWarehouse &&
        itemRow.subWarehouseId !== options.subWarehouseId
      ) {
        throw new ORPCError("BAD_REQUEST", {
          message: `物品「${itemRow.name}」不属于当前子仓库，如确需跨仓借用请使用「跨仓借用」功能`,
        });
      }

      const [sourceWarehouse] = tx
        .select({ name: subWarehouse.name, status: subWarehouse.status })
        .from(subWarehouse)
        .where(eq(subWarehouse.id, itemRow.subWarehouseId))
        .all();

      if (
        sourceWarehouse === undefined ||
        sourceWarehouse.status !== "active"
      ) {
        throw new ORPCError("BAD_REQUEST", {
          message: `物品「${itemRow.name}」所在子仓库已停用，不能登记消耗`,
        });
      }

      lines.push({ quantity: line.quantity, row: itemRow });
    }

    tx.insert(usageRecord)
      .values({
        backfillReason: options.backfillReason,
        id: usageId,
        isBackfill: options.isBackfill,
        matterId: options.matterId,
        subWarehouseId: options.subWarehouseId,
        note: options.note,
        operatorName,
        operatorUserId: user.id,
        patientName: options.patientName,
        patientNo: options.patientNo,
        patientPhone: options.patientPhone,
        patientType: options.patientType,
        recordId: options.recordId,
        usedAt: options.usedAt,
        usedAtTime: options.usedAtTime,
      })
      .run();

    for (const line of lines) {
      const [updatedItem] = tx
        .update(item)
        .set({
          stock: sql`${item.stock} - ${line.quantity}`,
          updatedAt: now,
        })
        .where(
          and(eq(item.id, line.row.id), sql`${item.stock} >= ${line.quantity}`)
        )
        .returning()
        .all();

      if (updatedItem === undefined) {
        throw usageConflict(`库存不足：${line.row.name}`);
      }

      tx.insert(usageItem)
        .values({
          id: randomUUID(),
          itemId: line.row.id,
          itemName: line.row.name,
          itemSpec: line.row.spec,
          quantity: line.quantity,
          unit: line.row.unit,
          usageId,
        })
        .run();

      tx.insert(stockMovement)
        .values({
          id: randomUUID(),
          itemId: line.row.id,
          matterId: options.matterId,
          note: options.movementNote,
          subWarehouseId: options.subWarehouseId,
          operatorName,
          operatorUserId: user.id,
          quantityDelta: -line.quantity,
          refId: usageId,
          refType: "usage",
          stockAfter: updatedItem.stock,
          type: "consumption",
        })
        .run();
    }
  });

  return usageId;
};

export const usageRouter = {
  create: protectedProcedure
    .input(usageBaseInput)
    .handler(async ({ context, input }) => {
      const matterAccess = await assertMatterAccess(
        context.db,
        context.user,
        input.matterId
      );

      assertMatterActive(matterAccess);

      const subWarehouseId = await resolveSubWarehouseId(
        context.db,
        context.user,
        input.matterId,
        input.subWarehouseId
      );

      const [record] = context.db
        .select({ id: handoverRecord.id, status: handoverRecord.status })
        .from(handoverRecord)
        .where(
          and(
            eq(handoverRecord.matterId, input.matterId),
            eq(handoverRecord.subWarehouseId, subWarehouseId),
            eq(handoverRecord.recordDate, input.usedAt)
          )
        )
        .all();

      if (record === undefined) {
        throw usageConflict("该日期还没有交接记录，请先在扫码页完成接班核对");
      }

      if (record.status === "pending_acceptance") {
        throw usageConflict("请先完成接班核对并确认接收，再登记用物");
      }

      if (record.status !== "accepted") {
        throw usageConflict("当前班次已交班，请使用补登记功能");
      }

      const diffItems = context.db
        .select({ id: handoverRecordItem.id })
        .from(handoverRecordItem)
        .where(
          and(
            eq(handoverRecordItem.recordId, record.id),
            ne(handoverRecordItem.actualQty, handoverRecordItem.expectedQty)
          )
        )
        .all();

      if (diffItems.length > 0) {
        const [reported] = context.db
          .select({ id: exceptionEvent.id })
          .from(exceptionEvent)
          .where(eq(exceptionEvent.recordId, record.id))
          .all();

        if (reported === undefined) {
          throw usageConflict(
            `接班核对发现 ${diffItems.length} 项数量差异，请先提交异常上报后再登记用物`
          );
        }
      }

      const usageId = writeUsage(context.db, context.user, {
        allowCrossWarehouse: input.allowCrossWarehouse,
        backfillReason: null,
        isBackfill: false,
        items: input.items,
        matterId: input.matterId,
        movementNote: null,
        note: input.note ?? null,
        operatorName: input.operatorName,
        patientName: input.patientName,
        patientNo: input.patientNo,
        patientPhone: input.patientPhone ?? null,
        patientType: input.patientType,
        recordId: record.id,
        subWarehouseId,
        usedAt: input.usedAt,
        usedAtTime: null,
      });

      const created = loadUsageRow(context.db, usageId);

      if (created === undefined) {
        throw new ORPCError("CONFLICT", {
          message: "用物记录创建失败，请重试",
        });
      }

      return loadUsageDto(context.db, created);
    }),

  /** 补登记：不要求当日已接班/未交班，但必须登录、记录使用时间与补录原因。 */
  backfill: protectedProcedure
    .input(
      usageBaseInput.extend({
        backfillReason: z
          .string()
          .trim()
          .min(2, "请填写补录原因")
          .max(300, "补录原因最多 300 字"),
        usedTime: z
          .string()
          .regex(
            /^(?<hour>[01][0-9]|2[0-3]):[0-5][0-9]$/u,
            "使用时间格式应为 HH:mm"
          ),
      })
    )
    .handler(async ({ context, input }) => {
      const matterAccess = await assertMatterAccess(
        context.db,
        context.user,
        input.matterId
      );

      assertMatterActive(matterAccess);

      const subWarehouseId = await resolveSubWarehouseId(
        context.db,
        context.user,
        input.matterId,
        input.subWarehouseId
      );

      const teamRow = loadTeamRow(context.db, matterAccess.teamId);
      const today = todayInTimeZone(teamRow?.timezone ?? "Asia/Shanghai");

      if (input.usedAt > today) {
        throw new ORPCError("BAD_REQUEST", {
          message: "补录日期不能晚于今天",
        });
      }

      const [record] = context.db
        .select({ id: handoverRecord.id })
        .from(handoverRecord)
        .where(
          and(
            eq(handoverRecord.matterId, input.matterId),
            eq(handoverRecord.subWarehouseId, subWarehouseId),
            eq(handoverRecord.recordDate, input.usedAt)
          )
        )
        .all();

      const usageId = writeUsage(context.db, context.user, {
        allowCrossWarehouse: input.allowCrossWarehouse,
        backfillReason: input.backfillReason,
        isBackfill: true,
        items: input.items,
        matterId: input.matterId,
        movementNote: `补录：${input.backfillReason}`,
        note: input.note ?? null,
        operatorName: input.operatorName,
        patientName: input.patientName,
        patientNo: input.patientNo,
        patientPhone: input.patientPhone ?? null,
        patientType: input.patientType,
        recordId: record?.id ?? null,
        subWarehouseId,
        usedAt: input.usedAt,
        usedAtTime: input.usedTime,
      });

      const created = loadUsageRow(context.db, usageId);

      if (created === undefined) {
        throw new ORPCError("CONFLICT", {
          message: "补登记记录创建失败，请重试",
        });
      }

      return loadUsageDto(context.db, created);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(({ context, input }) => {
      const row = requireUsageInScope(context.db, context.user, input.id);

      return loadUsageDto(context.db, row);
    }),

  list: protectedProcedure
    .input(
      z
        .object({
          from: calendarDateSchema.optional(),
          matterId: z.string().min(1).optional(),
          subWarehouseId: z.string().min(1).optional(),
          status: z.enum(["active", "revoke_pending", "revoked"]).optional(),
          teamId: z.string().min(1).optional(),
          to: calendarDateSchema.optional(),
        })
        .extend(paginationSchema.shape)
    )
    .handler(async ({ context, input }) => {
      if (
        input.from !== undefined &&
        input.to !== undefined &&
        input.from > input.to
      ) {
        throw new ORPCError("BAD_REQUEST", {
          message: "开始日期不能晚于结束日期",
        });
      }

      const matterAccess =
        input.matterId === undefined
          ? null
          : await assertMatterAccess(context.db, context.user, input.matterId);

      const teamId =
        matterAccess === null
          ? await resolveTeamId(context.db, context.user, input.teamId)
          : matterAccess.teamId;

      const conditions = [
        eq(matter.teamId, teamId),
        ...(input.matterId === undefined
          ? []
          : [eq(usageRecord.matterId, input.matterId)]),
        ...(input.subWarehouseId === undefined
          ? []
          : [eq(usageRecord.subWarehouseId, input.subWarehouseId)]),
        ...(input.status === undefined
          ? []
          : [eq(usageRecord.status, input.status)]),
        ...(input.from === undefined
          ? []
          : [gte(usageRecord.usedAt, input.from)]),
        ...(input.to === undefined ? [] : [lte(usageRecord.usedAt, input.to)]),
      ];

      const where = and(...conditions);

      const total =
        context.db
          .select({ value: count() })
          .from(usageRecord)
          .innerJoin(matter, eq(usageRecord.matterId, matter.id))
          .where(where)
          .all()[0]?.value ?? 0;

      const rows = context.db
        .select({ usage: usageRecord })
        .from(usageRecord)
        .innerJoin(matter, eq(usageRecord.matterId, matter.id))
        .where(where)
        .orderBy(desc(usageRecord.usedAt), desc(usageRecord.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize)
        .all();

      return {
        items: loadUsageDtos(
          context.db,
          rows.map((row) => row.usage)
        ),
        page: input.page,
        pageSize: input.pageSize,
        total,
      };
    }),

  pendingRevokes: adminProcedure
    .input(z.object({ teamId: z.string().min(1).optional() }))
    .handler(async ({ context, input }) => {
      const teamId = await resolveTeamId(
        context.db,
        context.user,
        input.teamId
      );

      const rows = context.db
        .select({ request: revokeRequest, usage: usageRecord })
        .from(revokeRequest)
        .innerJoin(usageRecord, eq(revokeRequest.usageId, usageRecord.id))
        .innerJoin(matter, eq(usageRecord.matterId, matter.id))
        .where(
          and(eq(matter.teamId, teamId), eq(revokeRequest.status, "pending"))
        )
        .orderBy(revokeRequest.createdAt)
        .all();

      const usageDtos = loadUsageDtos(
        context.db,
        rows.map((row) => row.usage)
      );

      return rows.map((row, index) => {
        const usage = usageDtos[index];

        if (usage === undefined) {
          throw new Error("撤销申请缺少用物记录");
        }

        return { ...toRevokeRequestDto(row.request), usage };
      });
    }),

  requestRevoke: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        reason: z.string().trim().min(1).max(300),
      })
    )
    .handler(({ context, input }) => {
      const usage = requireUsageInScope(context.db, context.user, input.id);
      const now = new Date();
      const requestId = randomUUID();

      context.db.transaction((tx) => {
        const [current] = tx
          .select()
          .from(usageRecord)
          .where(eq(usageRecord.id, usage.id))
          .all();

        if (current === undefined) {
          throw new ORPCError("NOT_FOUND", { message: "用物记录不存在" });
        }

        if (current.status === "revoked") {
          throw usageConflict("该记录已撤销，不能再次申请");
        }

        if (current.status === "revoke_pending") {
          throw usageConflict("该记录已在撤销审批中");
        }

        const [pending] = tx
          .select({ id: revokeRequest.id })
          .from(revokeRequest)
          .where(
            and(
              eq(revokeRequest.usageId, usage.id),
              eq(revokeRequest.status, "pending")
            )
          )
          .all();

        if (pending !== undefined) {
          throw usageConflict("该记录已有待审批的撤销申请");
        }

        tx.insert(revokeRequest)
          .values({
            id: requestId,
            reason: input.reason,
            requestedByName: context.user.name,
            requestedByUserId: context.user.id,
            usageId: usage.id,
          })
          .run();

        tx.update(usageRecord)
          .set({ status: "revoke_pending", updatedAt: now })
          .where(eq(usageRecord.id, usage.id))
          .run();
      });

      const request = requireRevokeRow(context.db, requestId);

      return toRevokeRequestDto(request);
    }),

  reviewRevoke: adminProcedure
    .input(
      z.object({
        approve: z.boolean(),
        note: z.string().trim().max(300).nullish(),
        requestId: z.string().min(1),
      })
    )
    .handler(({ context, input }) => {
      const request = requireRevokeRow(context.db, input.requestId);

      const usage = requireUsageInScope(
        context.db,
        context.user,
        request.usageId
      );

      if (request.status !== "pending") {
        throw usageConflict("该撤销申请已处理");
      }

      const now = new Date();

      context.db.transaction((tx) => {
        const changed = tx
          .update(revokeRequest)
          .set({
            reviewNote: input.note ?? null,
            reviewedAt: now,
            reviewedByName: context.user.name,
            reviewedByUserId: context.user.id,
            status: input.approve ? "approved" : "rejected",
          })
          .where(
            and(
              eq(revokeRequest.id, request.id),
              eq(revokeRequest.status, "pending")
            )
          )
          .run();

        if (Number(changed.changes) === 0) {
          throw usageConflict("该撤销申请已处理");
        }

        if (!input.approve) {
          tx.update(usageRecord)
            .set({ status: "active", updatedAt: now })
            .where(eq(usageRecord.id, usage.id))
            .run();

          return;
        }

        const lines = tx
          .select()
          .from(usageItem)
          .where(eq(usageItem.usageId, usage.id))
          .all();

        for (const line of lines) {
          const [updatedItem] = tx
            .update(item)
            .set({
              stock: sql`${item.stock} + ${line.quantity}`,
              updatedAt: now,
            })
            .where(eq(item.id, line.itemId))
            .returning()
            .all();

          if (updatedItem === undefined) {
            throw new ORPCError("NOT_FOUND", { message: "物品不存在" });
          }

          tx.insert(stockMovement)
            .values({
              id: randomUUID(),
              itemId: line.itemId,
              matterId: usage.matterId,
              note: `撤销恢复：${input.note ?? request.reason}`,
              subWarehouseId: updatedItem.subWarehouseId,
              operatorName: context.user.name,
              operatorUserId: context.user.id,
              quantityDelta: line.quantity,
              refId: usage.id,
              refType: "usage",
              stockAfter: updatedItem.stock,
              type: "revoke",
            })
            .run();
        }

        tx.update(usageRecord)
          .set({ revokedAt: now, status: "revoked", updatedAt: now })
          .where(eq(usageRecord.id, usage.id))
          .run();
      });

      const updated = loadUsageRow(context.db, usage.id);

      if (updated === undefined) {
        throw new ORPCError("NOT_FOUND", { message: "用物记录不存在" });
      }

      return loadUsageDto(context.db, updated);
    }),
};
