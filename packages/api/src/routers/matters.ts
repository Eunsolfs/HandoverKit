import { randomBytes, randomUUID } from "node:crypto";

import { ORPCError } from "@orpc/server";
import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@handoverkit/db";
import {
  handoverRecord,
  item,
  matter,
  subWarehouse,
} from "@handoverkit/db/schema/handover";

import {
  assertMatterAccess,
  assertTeamAccess,
  resolveTeamId,
} from "#src/authz.ts";
import { toItemDto, toRecordStatus, toSubWarehouseDto } from "#src/dto.ts";
import type { MatterDto, SubWarehouseTodayStatusDto } from "#src/dto.ts";
import { todayInTimeZone } from "#src/lib/dates.ts";
import {
  loadMatterDto,
  loadMatterDtos,
  loadRecordDetail,
  loadTeamDto,
  loadTeamRow,
} from "#src/lib/loaders.ts";
import { ensureRecord } from "#src/lib/records.ts";
import { adminProcedure, protectedProcedure } from "#src/procedures.ts";

type MatterRow = typeof matter.$inferSelect;

const generateQrToken = (): string =>
  `${randomUUID().replaceAll("-", "")}${randomBytes(8).toString("hex")}`;

const nullableText = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? null : trimmed;
};

const loadMatterRow = (db: Database, id: string): MatterRow | undefined =>
  db.select().from(matter).where(eq(matter.id, id)).all()[0];

const requireMatterRow = (db: Database, id: string): MatterRow => {
  const row = loadMatterRow(db, id);

  if (row === undefined) {
    throw new ORPCError("NOT_FOUND", { message: "交接事项不存在" });
  }

  return row;
};

const requireUniqueName = (
  db: Database,
  teamId: string,
  name: string,
  excludeId?: string
) => {
  const base = and(eq(matter.teamId, teamId), eq(matter.name, name));

  const condition =
    excludeId === undefined ? base : and(base, ne(matter.id, excludeId));

  const [taken] = db
    .select({ id: matter.id })
    .from(matter)
    .where(condition)
    .all();

  if (taken !== undefined) {
    throw new ORPCError("CONFLICT", {
      message: "同一团队下已存在同名交接事项",
    });
  }
};

const requireUniqueCode = (
  db: Database,
  teamId: string,
  code: string,
  excludeId?: string
) => {
  const base = and(eq(matter.teamId, teamId), eq(matter.code, code));

  const condition =
    excludeId === undefined ? base : and(base, ne(matter.id, excludeId));

  const [taken] = db
    .select({ id: matter.id })
    .from(matter)
    .where(condition)
    .all();

  if (taken !== undefined) {
    throw new ORPCError("CONFLICT", {
      message: "同一团队下已存在相同编码的交接事项",
    });
  }
};

const toMatterDtoWithToday = (db: Database, row: MatterRow): MatterDto => {
  const teamRow = loadTeamRow(db, row.teamId);
  const recordDate = todayInTimeZone(teamRow?.timezone ?? "Asia/Shanghai");

  return loadMatterDto(db, row, recordDate);
};

type MatterPatch = Partial<typeof matter.$inferInsert>;

const isUniqueViolation = (error: Error): boolean =>
  error.message.includes("UNIQUE constraint failed");

const updateMatterReturning = (
  db: Database,
  id: string,
  patch: MatterPatch
): MatterRow => {
  const [updated] = db
    .update(matter)
    .set(patch)
    .where(eq(matter.id, id))
    .returning()
    .all();

  if (updated === undefined) {
    throw new ORPCError("NOT_FOUND", { message: "交接事项不存在" });
  }

  return updated;
};

export const mattersRouter = {
  archive: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      await assertMatterAccess(context.db, context.user, input.id);

      const updated = updateMatterReturning(context.db, input.id, {
        status: "archived",
      });

      return toMatterDtoWithToday(context.db, updated);
    }),

  byToken: protectedProcedure
    .input(
      z.object({
        subWarehouseId: z.string().min(1).optional(),
        token: z.string().trim().min(16).max(128),
      })
    )
    .handler(({ context, input }) => {
      const [row] = context.db
        .select()
        .from(matter)
        .where(eq(matter.qrToken, input.token))
        .all();

      if (row === undefined) {
        throw new ORPCError("NOT_FOUND", { message: "二维码无效或已失效" });
      }

      if (row.status !== "active") {
        throw new ORPCError("CONFLICT", {
          message: "该交接事项已归档，无法继续使用",
        });
      }

      assertTeamAccess(context.user, row.teamId);

      const teamRow = loadTeamRow(context.db, row.teamId);

      if (teamRow === undefined) {
        throw new ORPCError("NOT_FOUND", { message: "团队不存在" });
      }

      const recordDate = todayInTimeZone(teamRow.timezone);

      const warehouseRows = context.db
        .select()
        .from(subWarehouse)
        .where(
          and(
            eq(subWarehouse.matterId, row.id),
            eq(subWarehouse.status, "active")
          )
        )
        .orderBy(subWarehouse.sortOrder, subWarehouse.createdAt)
        .all();

      const selected =
        input.subWarehouseId === undefined
          ? warehouseRows[0]
          : warehouseRows.find(
              (warehouse) => warehouse.id === input.subWarehouseId
            );

      if (selected === undefined) {
        throw new ORPCError("NOT_FOUND", {
          message:
            input.subWarehouseId === undefined
              ? "该事项还没有可用子仓库"
              : "子仓库不存在",
        });
      }

      const record = ensureRecord(context.db, row.id, selected.id, recordDate);

      const items = context.db
        .select()
        .from(item)
        .where(and(eq(item.matterId, row.id), eq(item.status, "active")))
        .orderBy(item.createdAt)
        .all();

      const warehouseNames = new Map(
        context.db
          .select({ id: subWarehouse.id, name: subWarehouse.name })
          .from(subWarehouse)
          .where(eq(subWarehouse.matterId, row.id))
          .all()
          .map((warehouse) => [warehouse.id, warehouse.name])
      );

      const warehouseStats = context.db
        .select({
          itemCount: sql<number>`count(${item.id})`,
          subWarehouseId: item.subWarehouseId,
          totalStock: sql<number>`coalesce(sum(${item.stock}), 0)`,
        })
        .from(item)
        .where(and(eq(item.matterId, row.id), eq(item.status, "active")))
        .groupBy(item.subWarehouseId)
        .all();

      const statsById = new Map(
        warehouseStats.map((stat) => [stat.subWarehouseId, stat])
      );

      return {
        items: items.map((itemRow) =>
          toItemDto(itemRow, warehouseNames.get(itemRow.subWarehouseId) ?? "")
        ),
        matter: loadMatterDto(context.db, row, recordDate),
        selectedSubWarehouseId: selected.id,
        subWarehouses: warehouseRows.map((warehouse) => {
          const stat = statsById.get(warehouse.id);

          return toSubWarehouseDto(
            warehouse,
            stat?.itemCount ?? 0,
            stat?.totalStock ?? 0
          );
        }),
        team: loadTeamDto(context.db, teamRow),
        today: loadRecordDetail(context.db, context.user, record),
      };
    }),

  create: adminProcedure
    .input(
      z.object({
        code: z.string().trim().max(30).optional(),
        description: z.string().trim().max(300).optional(),
        name: z.string().trim().min(1).max(60),
        teamId: z.string().min(1).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const teamId = await resolveTeamId(
        context.db,
        context.user,
        input.teamId
      );

      const code = nullableText(input.code);

      requireUniqueName(context.db, teamId, input.name);

      if (code !== null) {
        requireUniqueCode(context.db, teamId, code);
      }

      try {
        const created = context.db.transaction((tx) => {
          const [matterRow] = tx
            .insert(matter)
            .values({
              code,
              description: nullableText(input.description),
              name: input.name,
              qrToken: generateQrToken(),
              teamId,
            })
            .returning()
            .all();

          if (matterRow === undefined) {
            throw new ORPCError("CONFLICT", {
              message: "交接事项创建失败，请重试",
            });
          }

          tx.insert(subWarehouse)
            .values({
              id: randomUUID(),
              matterId: matterRow.id,
              name: "主仓库",
              sortOrder: 0,
            })
            .run();

          return matterRow;
        });

        return toMatterDtoWithToday(context.db, created);
      } catch (error) {
        if (error instanceof Error && isUniqueViolation(error)) {
          throw new ORPCError("CONFLICT", {
            message: "交接事项名称或编码已存在，请重试",
          });
        }

        throw error;
      }
    }),

  list: protectedProcedure
    .input(
      z.object({
        includeArchived: z.boolean().optional(),
        teamId: z.string().min(1).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const teamId = await resolveTeamId(
        context.db,
        context.user,
        input.teamId
      );

      const teamRow = loadTeamRow(context.db, teamId);
      const recordDate = todayInTimeZone(teamRow?.timezone ?? "Asia/Shanghai");

      const rows = context.db
        .select()
        .from(matter)
        .where(
          input.includeArchived === true
            ? eq(matter.teamId, teamId)
            : and(eq(matter.teamId, teamId), eq(matter.status, "active"))
        )
        .orderBy(matter.createdAt)
        .all();

      return loadMatterDtos(context.db, rows, recordDate);
    }),

  todayStatuses: protectedProcedure
    .input(z.object({ teamId: z.string().min(1).optional() }))
    .handler(
      async ({ context, input }): Promise<SubWarehouseTodayStatusDto[]> => {
        const teamId = await resolveTeamId(
          context.db,
          context.user,
          input.teamId
        );

        const teamRow = loadTeamRow(context.db, teamId);

        const recordDate = todayInTimeZone(
          teamRow?.timezone ?? "Asia/Shanghai"
        );

        const matterRows = context.db
          .select()
          .from(matter)
          .where(and(eq(matter.teamId, teamId), eq(matter.status, "active")))
          .orderBy(matter.createdAt)
          .all();

        const matterIds = matterRows.map((row) => row.id);

        if (matterIds.length === 0) {
          return [];
        }

        const warehouseRows = context.db
          .select()
          .from(subWarehouse)
          .where(
            and(
              inArray(subWarehouse.matterId, matterIds),
              eq(subWarehouse.status, "active")
            )
          )
          .orderBy(subWarehouse.sortOrder, subWarehouse.createdAt)
          .all();

        const warehouseIds = warehouseRows.map((row) => row.id);

        if (warehouseIds.length === 0) {
          return [];
        }

        const recordRows = context.db
          .select({
            id: handoverRecord.id,
            status: handoverRecord.status,
            subWarehouseId: handoverRecord.subWarehouseId,
          })
          .from(handoverRecord)
          .where(
            and(
              inArray(handoverRecord.subWarehouseId, warehouseIds),
              eq(handoverRecord.recordDate, recordDate)
            )
          )
          .all();

        const recordByWarehouse = new Map(
          recordRows.map((row) => [row.subWarehouseId, row])
        );

        const itemCountRows = context.db
          .select({
            subWarehouseId: item.subWarehouseId,
            value: count(),
          })
          .from(item)
          .where(
            and(
              inArray(item.subWarehouseId, warehouseIds),
              eq(item.status, "active")
            )
          )
          .groupBy(item.subWarehouseId)
          .all();

        const itemCountByWarehouse = new Map(
          itemCountRows.map((row) => [row.subWarehouseId, row.value])
        );

        return matterRows.flatMap((matterRow) =>
          warehouseRows
            .filter((warehouse) => warehouse.matterId === matterRow.id)
            .map((warehouse) => {
              const record = recordByWarehouse.get(warehouse.id);

              return {
                itemCount: itemCountByWarehouse.get(warehouse.id) ?? 0,
                matterCode: matterRow.code,
                matterId: matterRow.id,
                matterName: matterRow.name,
                qrToken: matterRow.qrToken,
                recordId: record?.id ?? null,
                status:
                  record === undefined ? null : toRecordStatus(record.status),
                subWarehouseId: warehouse.id,
                subWarehouseName: warehouse.name,
              };
            })
        );
      }
    ),

  rotateQr: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      await assertMatterAccess(context.db, context.user, input.id);

      const [updated] = context.db
        .update(matter)
        .set({
          qrChangedAt: new Date(),
          qrToken: generateQrToken(),
          qrVersion: sql`${matter.qrVersion} + 1`,
        })
        .where(eq(matter.id, input.id))
        .returning()
        .all();

      if (updated === undefined) {
        throw new ORPCError("NOT_FOUND", { message: "交接事项不存在" });
      }

      return { qrToken: updated.qrToken, qrVersion: updated.qrVersion };
    }),

  update: adminProcedure
    .input(
      z.object({
        code: z.string().trim().max(30).nullish(),
        description: z.string().trim().max(300).nullish(),
        id: z.string().min(1),
        name: z.string().trim().min(1).max(60).optional(),
        status: z.enum(["active", "archived"]).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const access = await assertMatterAccess(
        context.db,
        context.user,
        input.id
      );

      const current = requireMatterRow(context.db, input.id);

      if (input.name !== undefined && input.name !== current.name) {
        requireUniqueName(context.db, access.teamId, input.name, current.id);
      }

      const code = nullableText(input.code);

      if (code !== null && code !== current.code) {
        requireUniqueCode(context.db, access.teamId, code, current.id);
      }

      const patch: MatterPatch = {};

      if (input.code !== undefined) {
        patch.code = code;
      }

      if (input.description !== undefined) {
        patch.description = nullableText(input.description);
      }

      if (input.name !== undefined) {
        patch.name = input.name;
      }

      if (input.status !== undefined) {
        patch.status = input.status;
      }

      try {
        const updated = updateMatterReturning(context.db, current.id, patch);

        return toMatterDtoWithToday(context.db, updated);
      } catch (error) {
        if (error instanceof Error && isUniqueViolation(error)) {
          throw new ORPCError("CONFLICT", {
            message: "交接事项名称或编码已存在，请重试",
          });
        }

        throw error;
      }
    }),
};
