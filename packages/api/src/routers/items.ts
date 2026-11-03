import { randomUUID } from "node:crypto";

import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@handoverkit/db";
import {
  handoverRecordItem,
  item,
  stockMovement,
  usageItem,
} from "@handoverkit/db/schema/handover";

import { assertMatterAccess } from "#src/authz.ts";
import type { Profile } from "#src/context.ts";
import { toItemDto, toStockMovementDto } from "#src/dto.ts";
import type { ItemDto } from "#src/dto.ts";
import { adminProcedure, protectedProcedure } from "#src/procedures.ts";

type ItemRow = typeof item.$inferSelect;

const loadItemRow = (db: Database, id: string): ItemRow | undefined =>
  db.select().from(item).where(eq(item.id, id)).all()[0];

const requireItemRow = (db: Database, id: string): ItemRow => {
  const row = loadItemRow(db, id);

  if (row === undefined) {
    throw new ORPCError("NOT_FOUND", { message: "物品不存在" });
  }

  return row;
};

const requireItemInScope = async (
  db: Database,
  profile: Profile,
  id: string
): Promise<ItemRow> => {
  const row = requireItemRow(db, id);

  await assertMatterAccess(db, profile, row.matterId);

  return row;
};

const isUniqueViolation = (error: Error): boolean =>
  error.message.includes("UNIQUE constraint failed");

const requireUniqueItemName = (
  db: Database,
  matterId: string,
  name: string,
  excludeId?: string
) => {
  const base = and(eq(item.matterId, matterId), eq(item.name, name));

  const condition =
    excludeId === undefined ? base : and(base, ne(item.id, excludeId));

  const [taken] = db.select({ id: item.id }).from(item).where(condition).all();

  if (taken !== undefined) {
    throw new ORPCError("CONFLICT", {
      message: "同一交接事项下已存在同名物品",
    });
  }
};

const applyStockDelta = (
  db: Database,
  id: string,
  delta: number,
  note: string,
  operatorUserId: string,
  operatorName: string,
  type: "inbound" | "adjustment"
): ItemDto => {
  const result = db.transaction((tx) => {
    const [updated] = tx
      .update(item)
      .set({
        stock: sql`${item.stock} + ${delta}`,
        updatedAt: new Date(),
      })
      .where(and(eq(item.id, id), sql`${item.stock} + ${delta} >= 0`))
      .returning()
      .all();

    if (updated === undefined) {
      throw new ORPCError("BAD_REQUEST", { message: "调整后库存不能为负" });
    }

    tx.insert(stockMovement)
      .values({
        id: randomUUID(),
        itemId: updated.id,
        matterId: updated.matterId,
        note,
        operatorName,
        operatorUserId,
        quantityDelta: delta,
        refType: "manual",
        stockAfter: updated.stock,
        type,
      })
      .run();

    return updated;
  });

  return toItemDto(result);
};

export const itemsRouter = {
  adjust: adminProcedure
    .input(
      z.object({
        id: z.string().min(1),
        note: z.string().trim().min(1).max(200),
        quantityDelta: z
          .number()
          .int()
          .refine((value) => value !== 0, "调整数量不能为 0"),
      })
    )
    .handler(async ({ context, input }) => {
      const row = await requireItemInScope(context.db, context.user, input.id);

      const dto = applyStockDelta(
        context.db,
        row.id,
        input.quantityDelta,
        input.note,
        context.user.id,
        context.user.name,
        "adjustment"
      );

      return dto;
    }),

  create: adminProcedure
    .input(
      z.object({
        category: z.string().trim().max(30).optional(),
        location: z.string().trim().max(60).optional(),
        matterId: z.string().min(1),
        minStock: z.number().int().min(0).default(0),
        name: z.string().trim().min(1).max(80),
        note: z.string().trim().max(200).optional(),
        spec: z.string().trim().max(80).optional(),
        stock: z.number().int().min(0).default(0),
        unit: z.string().trim().min(1).max(20),
      })
    )
    .handler(async ({ context, input }) => {
      await assertMatterAccess(context.db, context.user, input.matterId);
      requireUniqueItemName(context.db, input.matterId, input.name);

      try {
        const created = context.db.transaction((tx) => {
          const [row] = tx
            .insert(item)
            .values({
              category: input.category ?? null,
              id: randomUUID(),
              location: input.location ?? null,
              matterId: input.matterId,
              minStock: input.minStock,
              name: input.name,
              note: input.note ?? null,
              spec: input.spec ?? null,
              stock: input.stock,
              unit: input.unit,
            })
            .returning()
            .all();

          if (row === undefined) {
            throw new ORPCError("CONFLICT", {
              message: "物品创建失败，请重试",
            });
          }

          if (row.stock > 0) {
            tx.insert(stockMovement)
              .values({
                id: randomUUID(),
                itemId: row.id,
                matterId: row.matterId,
                note: "初始库存",
                operatorName: context.user.name,
                operatorUserId: context.user.id,
                quantityDelta: row.stock,
                refType: "manual",
                stockAfter: row.stock,
                type: "initial",
              })
              .run();
          }

          return row;
        });

        return toItemDto(created);
      } catch (error) {
        if (error instanceof Error && isUniqueViolation(error)) {
          throw new ORPCError("CONFLICT", {
            message: "同一交接事项下已存在同名物品",
          });
        }

        throw error;
      }
    }),

  inbound: adminProcedure
    .input(
      z.object({
        id: z.string().min(1),
        note: z.string().trim().max(200).optional(),
        quantity: z.number().int().min(1).max(100_000),
      })
    )
    .handler(async ({ context, input }) => {
      await requireItemInScope(context.db, context.user, input.id);

      const dto = applyStockDelta(
        context.db,
        input.id,
        input.quantity,
        input.note ?? "入库",
        context.user.id,
        context.user.name,
        "inbound"
      );

      return dto;
    }),

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
        .from(item)
        .where(
          input.includeArchived === true
            ? eq(item.matterId, input.matterId)
            : and(eq(item.matterId, input.matterId), eq(item.status, "active"))
        )
        .orderBy(item.createdAt)
        .all();

      return rows.map(toItemDto);
    }),

  movements: protectedProcedure
    .input(z.object({ itemId: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      await requireItemInScope(context.db, context.user, input.itemId);

      const rows = context.db
        .select()
        .from(stockMovement)
        .where(eq(stockMovement.itemId, input.itemId))
        .orderBy(desc(stockMovement.createdAt), desc(stockMovement.id))
        .limit(100)
        .all();

      return rows.map(toStockMovementDto);
    }),

  remove: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      await requireItemInScope(context.db, context.user, input.id);

      const usageCount =
        context.db
          .select({ value: count() })
          .from(usageItem)
          .where(eq(usageItem.itemId, input.id))
          .all()[0]?.value ?? 0;

      const movementCount =
        context.db
          .select({ value: count() })
          .from(stockMovement)
          .where(eq(stockMovement.itemId, input.id))
          .all()[0]?.value ?? 0;

      const recordItemCount =
        context.db
          .select({ value: count() })
          .from(handoverRecordItem)
          .where(eq(handoverRecordItem.itemId, input.id))
          .all()[0]?.value ?? 0;

      if (usageCount > 0 || movementCount > 0 || recordItemCount > 0) {
        throw new ORPCError("CONFLICT", {
          message: "该物品已有库存流水或交接记录，请改为停用",
        });
      }

      context.db.delete(item).where(eq(item.id, input.id)).run();

      return { ok: true as const };
    }),

  update: adminProcedure
    .input(
      z.object({
        category: z.string().trim().max(30).nullish(),
        id: z.string().min(1),
        location: z.string().trim().max(60).nullish(),
        minStock: z.number().int().min(0).optional(),
        name: z.string().trim().min(1).max(80).optional(),
        note: z.string().trim().max(200).nullish(),
        spec: z.string().trim().max(80).nullish(),
        status: z.enum(["active", "archived"]).optional(),
        unit: z.string().trim().min(1).max(20).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const current = await requireItemInScope(
        context.db,
        context.user,
        input.id
      );

      if (input.name !== undefined && input.name !== current.name) {
        requireUniqueItemName(
          context.db,
          current.matterId,
          input.name,
          current.id
        );
      }

      const patch: Partial<typeof item.$inferInsert> = {};

      if (input.category !== undefined) {
        patch.category = input.category;
      }

      if (input.location !== undefined) {
        patch.location = input.location;
      }

      if (input.minStock !== undefined) {
        patch.minStock = input.minStock;
      }

      if (input.name !== undefined) {
        patch.name = input.name;
      }

      if (input.note !== undefined) {
        patch.note = input.note;
      }

      if (input.spec !== undefined) {
        patch.spec = input.spec;
      }

      if (input.status !== undefined) {
        patch.status = input.status;
      }

      if (input.unit !== undefined) {
        patch.unit = input.unit;
      }

      try {
        const [updated] = context.db
          .update(item)
          .set(patch)
          .where(eq(item.id, current.id))
          .returning()
          .all();

        if (updated === undefined) {
          throw new ORPCError("NOT_FOUND", { message: "物品不存在" });
        }

        return toItemDto(updated);
      } catch (error) {
        if (error instanceof Error && isUniqueViolation(error)) {
          throw new ORPCError("CONFLICT", {
            message: "同一交接事项下已存在同名物品",
          });
        }

        throw error;
      }
    }),
};
