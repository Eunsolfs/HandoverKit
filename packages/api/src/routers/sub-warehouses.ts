import { randomUUID } from "node:crypto";

import { ORPCError } from "@orpc/server";
import { and, count, eq, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@handoverkit/db";
import {
  handoverRecord,
  item,
  stockTransfer,
  subWarehouse,
  usageRecord,
} from "@handoverkit/db/schema/handover";

import {
  assertMatterAccess,
  assertMatterActive,
  assertSubWarehouseAccess,
} from "#src/authz.ts";
import { toSubWarehouseDto } from "#src/dto.ts";
import { adminProcedure, protectedProcedure } from "#src/procedures.ts";

type SubWarehouseRow = typeof subWarehouse.$inferSelect;

const isUniqueViolation = (error: Error): boolean =>
  error.message.includes("UNIQUE constraint failed");

const requireSubWarehouseRow = async (
  db: Database,
  profile: Parameters<typeof assertSubWarehouseAccess>[1],
  id: string
): Promise<SubWarehouseRow> => {
  await assertSubWarehouseAccess(db, profile, id);

  const [row] = db
    .select()
    .from(subWarehouse)
    .where(eq(subWarehouse.id, id))
    .all();

  if (row === undefined) {
    throw new ORPCError("NOT_FOUND", { message: "子仓库不存在" });
  }

  return row;
};

const requireUniqueName = (
  db: Database,
  matterId: string,
  name: string,
  excludeId?: string
) => {
  const base = and(
    eq(subWarehouse.matterId, matterId),
    eq(subWarehouse.name, name)
  );

  const condition =
    excludeId === undefined ? base : and(base, ne(subWarehouse.id, excludeId));

  const [taken] = db
    .select({ id: subWarehouse.id })
    .from(subWarehouse)
    .where(condition)
    .all();

  if (taken !== undefined) {
    throw new ORPCError("CONFLICT", {
      message: "同一交接事项下已存在同名子仓库",
    });
  }
};

const loadStats = (db: Database, ids: string[]) => {
  if (ids.length === 0) {
    return new Map<string, { itemCount: number; totalStock: number }>();
  }

  const rows = db
    .select({
      key: subWarehouse.id,
      itemCount: count(item.id),
      totalStock: sql<number>`coalesce(sum(${item.stock}), 0)`,
    })
    .from(subWarehouse)
    .leftJoin(
      item,
      and(eq(item.subWarehouseId, subWarehouse.id), eq(item.status, "active"))
    )
    .where(
      sql`${subWarehouse.id} in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `
      )})`
    )
    .groupBy(subWarehouse.id)
    .all();

  return new Map(rows.map((row) => [row.key, row]));
};

export const subWarehousesRouter = {
  list: protectedProcedure
    .input(
      z.object({
        includeArchived: z.boolean().optional(),
        matterId: z.string().min(1),
      })
    )
    .handler(async ({ context, input }) => {
      await assertMatterAccess(context.db, context.user, input.matterId);

      const rows = context.db
        .select()
        .from(subWarehouse)
        .where(
          input.includeArchived === true
            ? eq(subWarehouse.matterId, input.matterId)
            : and(
                eq(subWarehouse.matterId, input.matterId),
                eq(subWarehouse.status, "active")
              )
        )
        .orderBy(subWarehouse.sortOrder, subWarehouse.createdAt)
        .all();

      const stats = loadStats(
        context.db,
        rows.map((row) => row.id)
      );

      return rows.map((row) => {
        const stat = stats.get(row.id);

        return toSubWarehouseDto(
          row,
          stat?.itemCount ?? 0,
          stat?.totalStock ?? 0
        );
      });
    }),

  create: adminProcedure
    .input(
      z.object({
        code: z.string().trim().max(30).optional(),
        description: z.string().trim().max(300).optional(),
        location: z.string().trim().max(60).optional(),
        matterId: z.string().min(1),
        name: z.string().trim().min(1).max(60),
        sortOrder: z.number().int().min(0).max(999).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const matterAccess = await assertMatterAccess(
        context.db,
        context.user,
        input.matterId
      );

      assertMatterActive(matterAccess);
      requireUniqueName(context.db, input.matterId, input.name);

      const nextSort =
        input.sortOrder ??
        (context.db
          .select({
            value: sql<number>`coalesce(max(${subWarehouse.sortOrder}), -1)`,
          })
          .from(subWarehouse)
          .where(eq(subWarehouse.matterId, input.matterId))
          .all()[0]?.value ?? -1) + 1;

      try {
        const [created] = context.db
          .insert(subWarehouse)
          .values({
            code: input.code ?? null,
            description: input.description ?? null,
            id: randomUUID(),
            location: input.location ?? null,
            matterId: input.matterId,
            name: input.name,
            sortOrder: nextSort,
          })
          .returning()
          .all();

        if (created === undefined) {
          throw new ORPCError("CONFLICT", {
            message: "子仓库创建失败，请重试",
          });
        }

        return toSubWarehouseDto(created, 0, 0);
      } catch (error) {
        if (error instanceof Error && isUniqueViolation(error)) {
          throw new ORPCError("CONFLICT", {
            message: "同一交接事项下已存在同名子仓库",
          });
        }

        throw error;
      }
    }),

  update: adminProcedure
    .input(
      z.object({
        code: z.string().trim().max(30).nullish(),
        description: z.string().trim().max(300).nullish(),
        id: z.string().min(1),
        location: z.string().trim().max(60).nullish(),
        name: z.string().trim().min(1).max(60).optional(),
        sortOrder: z.number().int().min(0).max(999).optional(),
        status: z.enum(["active", "archived"]).optional(),
      })
    )
    // eslint-disable-next-line complexity
    .handler(async ({ context, input }) => {
      const current = await requireSubWarehouseRow(
        context.db,
        context.user,
        input.id
      );

      if (input.name !== undefined && input.name !== current.name) {
        requireUniqueName(context.db, current.matterId, input.name, current.id);
      }

      if (input.status === "archived" && current.status !== "archived") {
        const [stockRow] = context.db
          .select({
            value: sql<number>`coalesce(sum(${item.stock}), 0)`,
          })
          .from(item)
          .where(eq(item.subWarehouseId, current.id))
          .all();

        if ((stockRow?.value ?? 0) > 0) {
          throw new ORPCError("CONFLICT", {
            message: "请先将该子仓库库存调拨或清零，再停用",
          });
        }
      }

      const patch: Partial<typeof subWarehouse.$inferInsert> = {};

      if (input.code !== undefined) {
        patch.code = input.code;
      }

      if (input.description !== undefined) {
        patch.description = input.description;
      }

      if (input.location !== undefined) {
        patch.location = input.location;
      }

      if (input.name !== undefined) {
        patch.name = input.name;
      }

      if (input.sortOrder !== undefined) {
        patch.sortOrder = input.sortOrder;
      }

      if (input.status !== undefined) {
        patch.status = input.status;
      }

      try {
        const [updated] = context.db
          .update(subWarehouse)
          .set(patch)
          .where(eq(subWarehouse.id, current.id))
          .returning()
          .all();

        if (updated === undefined) {
          throw new ORPCError("NOT_FOUND", { message: "子仓库不存在" });
        }

        const stats = loadStats(context.db, [updated.id]).get(updated.id);

        return toSubWarehouseDto(
          updated,
          stats?.itemCount ?? 0,
          stats?.totalStock ?? 0
        );
      } catch (error) {
        if (error instanceof Error && isUniqueViolation(error)) {
          throw new ORPCError("CONFLICT", {
            message: "同一交接事项下已存在同名子仓库",
          });
        }

        throw error;
      }
    }),

  remove: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const current = await requireSubWarehouseRow(
        context.db,
        context.user,
        input.id
      );

      const [itemCount] = context.db
        .select({ value: count() })
        .from(item)
        .where(eq(item.subWarehouseId, current.id))
        .all();

      const [recordCount] = context.db
        .select({ value: count() })
        .from(handoverRecord)
        .where(eq(handoverRecord.subWarehouseId, current.id))
        .all();

      const [usageCount] = context.db
        .select({ value: count() })
        .from(usageRecord)
        .where(eq(usageRecord.subWarehouseId, current.id))
        .all();

      const [transferCount] = context.db
        .select({ value: count() })
        .from(stockTransfer)
        .where(
          or(
            eq(stockTransfer.fromSubWarehouseId, current.id),
            eq(stockTransfer.toSubWarehouseId, current.id)
          )
        )
        .all();

      if (
        (itemCount?.value ?? 0) > 0 ||
        (recordCount?.value ?? 0) > 0 ||
        (usageCount?.value ?? 0) > 0 ||
        (transferCount?.value ?? 0) > 0
      ) {
        throw new ORPCError("CONFLICT", {
          message: "子仓库已有物品或业务记录，请改为停用",
        });
      }

      context.db
        .delete(subWarehouse)
        .where(eq(subWarehouse.id, current.id))
        .run();

      return { ok: true as const };
    }),
};
