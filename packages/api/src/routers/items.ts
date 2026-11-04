import { randomUUID } from "node:crypto";

import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, ne, sql } from "drizzle-orm";
import Jimp from "jimp";
import { z } from "zod";

import type { Database } from "@handoverkit/db";
import {
  handoverRecordItem,
  item,
  itemImage,
  stockMovement,
  stockTransfer,
  subWarehouse,
  usageItem,
} from "@handoverkit/db/schema/handover";

import {
  assertMatterAccess,
  assertMatterActive,
  assertSubWarehouseAccess,
  resolveSubWarehouseId,
} from "#src/authz.ts";
import type { SubWarehouseAccess } from "#src/authz.ts";
import type { Profile } from "#src/context.ts";
import { toItemDto, toStockMovementDto, toStockTransferDto } from "#src/dto.ts";
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
    .where(
      sql`${subWarehouse.id} in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `
      )})`
    )
    .all();

  return new Map(rows.map((row) => [row.id, row.name]));
};

const isUniqueViolation = (error: Error): boolean =>
  error.message.includes("UNIQUE constraint failed");

const requireUniqueItemName = (
  db: Database,
  subWarehouseId: string,
  name: string,
  excludeId?: string
) => {
  const base = and(
    eq(item.subWarehouseId, subWarehouseId),
    eq(item.name, name)
  );

  const condition =
    excludeId === undefined ? base : and(base, ne(item.id, excludeId));

  const [taken] = db.select({ id: item.id }).from(item).where(condition).all();

  if (taken !== undefined) {
    throw new ORPCError("CONFLICT", {
      message: "同一子仓库下已存在同名物品",
    });
  }
};

const applyStockDelta = (
  db: Database,
  row: ItemRow,
  delta: number,
  note: string,
  profile: Profile,
  type: "inbound" | "adjustment"
): ItemDto => {
  const result = db.transaction((tx) => {
    const [updated] = tx
      .update(item)
      .set({
        stock: sql`${item.stock} + ${delta}`,
        updatedAt: new Date(),
      })
      .where(and(eq(item.id, row.id), sql`${item.stock} + ${delta} >= 0`))
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
        operatorName: profile.name,
        operatorUserId: profile.id,
        quantityDelta: delta,
        refType: "manual",
        stockAfter: updated.stock,
        subWarehouseId: updated.subWarehouseId,
        type,
      })
      .run();

    return updated;
  });

  const name = loadSubWarehouseNames(db, [result.subWarehouseId]).get(
    result.subWarehouseId
  );

  return toItemDto(result, name ?? "");
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

      return applyStockDelta(
        context.db,
        row,
        input.quantityDelta,
        input.note,
        context.user,
        "adjustment"
      );
    }),

  create: adminProcedure
    .input(
      z.object({
        category: z.string().trim().max(30).optional(),
        location: z.string().trim().max(60).optional(),
        matterId: z.string().min(1).optional(),
        minStock: z.number().int().min(0).default(0),
        name: z.string().trim().min(1).max(80),
        note: z.string().trim().max(200).optional(),
        spec: z.string().trim().max(80).optional(),
        stock: z.number().int().min(0).default(0),
        subWarehouseId: z.string().min(1).optional(),
        unit: z.string().trim().min(1).max(20),
      })
    )
    .handler(async ({ context, input }) => {
      let access: SubWarehouseAccess;

      if (input.subWarehouseId === undefined) {
        if (input.matterId === undefined) {
          throw new ORPCError("BAD_REQUEST", {
            message: "必须指定交接事项或子仓库",
          });
        }

        const resolvedId = await resolveSubWarehouseId(
          context.db,
          context.user,
          input.matterId
        );

        access = await assertSubWarehouseAccess(
          context.db,
          context.user,
          resolvedId
        );
      } else {
        access = await assertSubWarehouseAccess(
          context.db,
          context.user,
          input.subWarehouseId
        );

        if (
          input.matterId !== undefined &&
          input.matterId !== access.matterId
        ) {
          throw new ORPCError("BAD_REQUEST", {
            message: "子仓库不属于该交接事项",
          });
        }
      }

      const matterAccess = await assertMatterAccess(
        context.db,
        context.user,
        access.matterId
      );

      assertMatterActive(matterAccess);

      requireUniqueItemName(context.db, access.id, input.name);

      try {
        const created = context.db.transaction((tx) => {
          const [row] = tx
            .insert(item)
            .values({
              category: input.category ?? null,
              id: randomUUID(),
              location: input.location ?? null,
              matterId: access.matterId,
              minStock: input.minStock,
              name: input.name,
              note: input.note ?? null,
              spec: input.spec ?? null,
              stock: input.stock,
              subWarehouseId: access.id,
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
                subWarehouseId: row.subWarehouseId,
                type: "initial",
              })
              .run();
          }

          return row;
        });

        return toItemDto(created, access.name);
      } catch (error) {
        if (error instanceof Error && isUniqueViolation(error)) {
          throw new ORPCError("CONFLICT", {
            message: "同一子仓库下已存在同名物品",
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
      const row = await requireItemInScope(context.db, context.user, input.id);

      return applyStockDelta(
        context.db,
        row,
        input.quantity,
        input.note ?? "入库",
        context.user,
        "inbound"
      );
    }),

  list: protectedProcedure
    .input(
      z
        .object({
          includeArchived: z.boolean().optional(),
          matterId: z.string().min(1).optional(),
          subWarehouseId: z.string().min(1).optional(),
        })
        .refine(
          (value) =>
            value.matterId !== undefined || value.subWarehouseId !== undefined,
          { message: "必须指定交接事项或子仓库" }
        )
    )
    .handler(async ({ context, input }) => {
      let { matterId } = input;

      if (input.subWarehouseId !== undefined) {
        const access = await assertSubWarehouseAccess(
          context.db,
          context.user,
          input.subWarehouseId
        );

        if (matterId !== undefined && matterId !== access.matterId) {
          throw new ORPCError("BAD_REQUEST", {
            message: "子仓库不属于该交接事项",
          });
        }

        ({ matterId } = access);
      }

      if (matterId === undefined) {
        throw new ORPCError("BAD_REQUEST", {
          message: "必须指定交接事项或子仓库",
        });
      }

      await assertMatterAccess(context.db, context.user, matterId);

      const scope =
        input.subWarehouseId === undefined
          ? eq(item.matterId, matterId)
          : eq(item.subWarehouseId, input.subWarehouseId);

      const rows = context.db
        .select()
        .from(item)
        .where(
          input.includeArchived === true
            ? scope
            : and(scope, eq(item.status, "active"))
        )
        .orderBy(item.createdAt)
        .all();

      const names = loadSubWarehouseNames(
        context.db,
        rows.map((row) => row.subWarehouseId)
      );

      return rows.map((row) =>
        toItemDto(row, names.get(row.subWarehouseId) ?? "")
      );
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

      context.db.transaction((tx) => {
        // 图片表也有级联删除，这里显式清理，确保任何 SQLite 配置下都不留孤儿图片。
        tx.delete(itemImage).where(eq(itemImage.itemId, input.id)).run();
        tx.delete(item).where(eq(item.id, input.id)).run();
      });

      return { ok: true as const };
    }),

  transfer: adminProcedure
    .input(
      z.object({
        fromSubWarehouseId: z.string().min(1),
        itemId: z.string().min(1),
        note: z.string().trim().max(200).nullable().optional(),
        quantity: z.number().int().min(1).max(100_000),
        toSubWarehouseId: z.string().min(1),
      })
    )
    .handler(async ({ context, input }) => {
      if (input.fromSubWarehouseId === input.toSubWarehouseId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "调出与调入子仓库不能相同",
        });
      }

      const fromAccess = await assertSubWarehouseAccess(
        context.db,
        context.user,
        input.fromSubWarehouseId
      );

      const toAccess = await assertSubWarehouseAccess(
        context.db,
        context.user,
        input.toSubWarehouseId
      );

      if (fromAccess.matterId !== toAccess.matterId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "只能在同一交接事项的子仓库之间调拨",
        });
      }

      if (fromAccess.status !== "active" || toAccess.status !== "active") {
        throw new ORPCError("CONFLICT", {
          message: "子仓库已停用，不能调拨",
        });
      }

      const source = await requireItemInScope(
        context.db,
        context.user,
        input.itemId
      );

      if (source.subWarehouseId !== fromAccess.id) {
        throw new ORPCError("BAD_REQUEST", {
          message: "物品不属于调出子仓库",
        });
      }

      if (source.status !== "active") {
        throw new ORPCError("BAD_REQUEST", {
          message: "调出物品已停用",
        });
      }

      const transferId = randomUUID();
      const transferNote = input.note ?? "";

      const result = context.db.transaction((tx) => {
        const [updatedSource] = tx
          .update(item)
          .set({
            stock: sql`${item.stock} - ${input.quantity}`,
            updatedAt: new Date(),
          })
          .where(
            and(eq(item.id, source.id), sql`${item.stock} >= ${input.quantity}`)
          )
          .returning()
          .all();

        if (updatedSource === undefined) {
          throw new ORPCError("CONFLICT", {
            message: `库存不足：${source.name}`,
          });
        }

        const targetCandidates = tx
          .select()
          .from(item)
          .where(eq(item.subWarehouseId, toAccess.id))
          .all();

        let target = targetCandidates.find(
          (row) =>
            row.name === source.name &&
            (row.spec ?? "") === (source.spec ?? "") &&
            row.unit === source.unit
        );

        if (target !== undefined && target.status !== "active") {
          throw new ORPCError("CONFLICT", {
            message: "调入子仓库存在同名停用物品，请先启用或改名",
          });
        }

        if (target === undefined) {
          const [createdTarget] = tx
            .insert(item)
            .values({
              category: source.category,
              id: randomUUID(),
              location: null,
              matterId: source.matterId,
              minStock: 0,
              name: source.name,
              note: source.note,
              spec: source.spec,
              stock: 0,
              subWarehouseId: toAccess.id,
              unit: source.unit,
            })
            .returning()
            .all();

          if (createdTarget === undefined) {
            throw new ORPCError("CONFLICT", {
              message: "调入物品创建失败，请重试",
            });
          }

          target = createdTarget;
        }

        const [updatedTarget] = tx
          .update(item)
          .set({
            stock: sql`${item.stock} + ${input.quantity}`,
            updatedAt: new Date(),
          })
          .where(eq(item.id, target.id))
          .returning()
          .all();

        if (updatedTarget === undefined) {
          throw new ORPCError("CONFLICT", {
            message: "调入库存更新失败，请重试",
          });
        }

        tx.insert(stockMovement)
          .values({
            id: randomUUID(),
            itemId: updatedSource.id,
            matterId: updatedSource.matterId,
            note: `调拨至 ${
              toAccess.name
            }${transferNote.length === 0 ? "" : `：${transferNote}`}`,
            operatorName: context.user.name,
            operatorUserId: context.user.id,
            quantityDelta: -input.quantity,
            refId: transferId,
            refType: "transfer",
            stockAfter: updatedSource.stock,
            subWarehouseId: updatedSource.subWarehouseId,
            type: "transfer_out",
          })
          .run();

        tx.insert(stockMovement)
          .values({
            id: randomUUID(),
            itemId: updatedTarget.id,
            matterId: updatedTarget.matterId,
            note: `调拨自 ${
              fromAccess.name
            }${transferNote.length === 0 ? "" : `：${transferNote}`}`,
            operatorName: context.user.name,
            operatorUserId: context.user.id,
            quantityDelta: input.quantity,
            refId: transferId,
            refType: "transfer",
            stockAfter: updatedTarget.stock,
            subWarehouseId: updatedTarget.subWarehouseId,
            type: "transfer_in",
          })
          .run();

        const [transferRow] = tx
          .insert(stockTransfer)
          .values({
            fromSubWarehouseId: fromAccess.id,
            id: transferId,
            itemName: source.name,
            itemSpec: source.spec,
            matterId: source.matterId,
            note: input.note ?? null,
            operatorName: context.user.name,
            operatorUserId: context.user.id,
            quantity: input.quantity,
            sourceItemId: source.id,
            targetItemId: updatedTarget.id,
            toSubWarehouseId: toAccess.id,
            unit: source.unit,
          })
          .returning()
          .all();

        if (transferRow === undefined) {
          throw new ORPCError("CONFLICT", {
            message: "调拨记录创建失败，请重试",
          });
        }

        return transferRow;
      });

      return toStockTransferDto(result, fromAccess.name, toAccess.name);
    }),

  transfers: protectedProcedure
    .input(
      z.object({
        matterId: z.string().min(1),
        subWarehouseId: z.string().min(1).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      await assertMatterAccess(context.db, context.user, input.matterId);

      const rows = context.db
        .select()
        .from(stockTransfer)
        .where(
          input.subWarehouseId === undefined
            ? eq(stockTransfer.matterId, input.matterId)
            : and(
                eq(stockTransfer.matterId, input.matterId),
                sql`(${stockTransfer.fromSubWarehouseId} = ${input.subWarehouseId} or ${stockTransfer.toSubWarehouseId} = ${input.subWarehouseId})`
              )
        )
        .orderBy(desc(stockTransfer.createdAt))
        .limit(50)
        .all();

      const names = loadSubWarehouseNames(context.db, [
        ...new Set(
          rows.flatMap((row) => [row.fromSubWarehouseId, row.toSubWarehouseId])
        ),
      ]);

      return rows.map((row) =>
        toStockTransferDto(
          row,
          names.get(row.fromSubWarehouseId) ?? "",
          names.get(row.toSubWarehouseId) ?? ""
        )
      );
    }),

  uploadImage: adminProcedure
    .input(
      z.object({
        id: z.string().min(1),
        imageData: z
          .string()
          .min(32)
          .max(12_000_000)
          .regex(
            /^data:image\/(?:png|jpe?g|webp);base64,/iu,
            "仅支持 PNG/JPEG/WebP 图片"
          ),
      })
    )
    .handler(async ({ context, input }) => {
      const row = await requireItemInScope(context.db, context.user, input.id);
      const base64 = input.imageData.slice(input.imageData.indexOf(",") + 1);
      const buffer = Buffer.from(base64, "base64");

      if (buffer.length > 8 * 1024 * 1024) {
        throw new ORPCError("BAD_REQUEST", {
          message: "图片不能超过 8MB",
        });
      }

      let output: Buffer;

      try {
        const image = await Jimp.read(buffer);
        image.cover(320, 320);
        image.quality(72);
        output = await image.getBufferAsync(Jimp.MIME_JPEG);
      } catch {
        throw new ORPCError("BAD_REQUEST", {
          message: "图片格式不支持或已损坏",
        });
      }

      if (output.length > 1_500_000) {
        throw new ORPCError("BAD_REQUEST", {
          message: "图片处理后仍然过大，请换一张更小的图片",
        });
      }

      const now = new Date();

      const updated = context.db.transaction((tx) => {
        tx.insert(itemImage)
          .values({
            data: output.toString("base64"),
            height: 320,
            itemId: row.id,
            mime: "image/jpeg",
            updatedAt: now,
            width: 320,
          })
          .onConflictDoUpdate({
            set: {
              data: output.toString("base64"),
              height: 320,
              mime: "image/jpeg",
              updatedAt: now,
              width: 320,
            },
            target: itemImage.itemId,
          })
          .run();

        const [itemRow] = tx
          .update(item)
          .set({ imageUpdatedAt: now, updatedAt: now })
          .where(eq(item.id, row.id))
          .returning()
          .all();

        if (itemRow === undefined) {
          throw new ORPCError("NOT_FOUND", { message: "物品不存在" });
        }

        return itemRow;
      });

      const name = loadSubWarehouseNames(context.db, [
        updated.subWarehouseId,
      ]).get(updated.subWarehouseId);

      return toItemDto(updated, name ?? "");
    }),

  removeImage: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const row = await requireItemInScope(context.db, context.user, input.id);
      const now = new Date();

      const updated = context.db.transaction((tx) => {
        tx.delete(itemImage).where(eq(itemImage.itemId, row.id)).run();

        const [itemRow] = tx
          .update(item)
          .set({ imageUpdatedAt: null, updatedAt: now })
          .where(eq(item.id, row.id))
          .returning()
          .all();

        if (itemRow === undefined) {
          throw new ORPCError("NOT_FOUND", { message: "物品不存在" });
        }

        return itemRow;
      });

      const name = loadSubWarehouseNames(context.db, [
        updated.subWarehouseId,
      ]).get(updated.subWarehouseId);

      return toItemDto(updated, name ?? "");
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
          current.subWarehouseId,
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

        const name = loadSubWarehouseNames(context.db, [
          updated.subWarehouseId,
        ]).get(updated.subWarehouseId);

        return toItemDto(updated, name ?? "");
      } catch (error) {
        if (error instanceof Error && isUniqueViolation(error)) {
          throw new ORPCError("CONFLICT", {
            message: "同一子仓库下已存在同名物品",
          });
        }

        throw error;
      }
    }),
};
