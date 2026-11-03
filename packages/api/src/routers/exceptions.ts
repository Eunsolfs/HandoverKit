import { randomUUID } from "node:crypto";

import { ORPCError } from "@orpc/server";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@handoverkit/db";
import {
  exceptionEvent,
  handoverRecord,
  item,
  matter,
} from "@handoverkit/db/schema/handover";

import { assertMatterAccess, resolveTeamId } from "#src/authz.ts";
import type { ExceptionDto } from "#src/dto.ts";
import { loadExceptionDtos } from "#src/lib/loaders.ts";
import { adminProcedure, protectedProcedure } from "#src/procedures.ts";

type ExceptionRow = typeof exceptionEvent.$inferSelect;

const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

const loadExceptionRow = (db: Database, id: string): ExceptionRow | undefined =>
  db.select().from(exceptionEvent).where(eq(exceptionEvent.id, id)).all()[0];

const toSingleDto = (db: Database, row: ExceptionRow): ExceptionDto => {
  const [dto] = loadExceptionDtos(db, [row]);

  if (dto === undefined) {
    throw new ORPCError("NOT_FOUND", { message: "异常事件不存在" });
  }

  return dto;
};

export const exceptionsRouter = {
  create: protectedProcedure
    .input(
      z.object({
        description: z.string().trim().min(1).max(500),
        itemId: z.string().min(1).optional(),
        matterId: z.string().min(1),
        recordId: z.string().min(1).optional(),
        severity: z.enum(["low", "medium", "high"]).default("medium"),
        type: z.enum(["missing", "damaged", "count_mismatch", "other"]),
      })
    )
    .handler(async ({ context, input }) => {
      await assertMatterAccess(context.db, context.user, input.matterId);

      if (input.recordId !== undefined) {
        const [record] = context.db
          .select({ matterId: handoverRecord.matterId })
          .from(handoverRecord)
          .where(eq(handoverRecord.id, input.recordId))
          .all();

        if (record === undefined || record.matterId !== input.matterId) {
          throw new ORPCError("NOT_FOUND", { message: "交接记录不存在" });
        }
      }

      if (input.itemId !== undefined) {
        const [itemRow] = context.db
          .select({ matterId: item.matterId })
          .from(item)
          .where(eq(item.id, input.itemId))
          .all();

        if (itemRow === undefined || itemRow.matterId !== input.matterId) {
          throw new ORPCError("NOT_FOUND", { message: "物品不存在" });
        }
      }

      const [created] = context.db
        .insert(exceptionEvent)
        .values({
          description: input.description,
          id: randomUUID(),
          itemId: input.itemId ?? null,
          matterId: input.matterId,
          recordId: input.recordId ?? null,
          reportedByName: context.user.name,
          reportedByUserId: context.user.id,
          severity: input.severity,
          type: input.type,
        })
        .returning()
        .all();

      if (created === undefined) {
        throw new ORPCError("CONFLICT", {
          message: "异常事件创建失败，请重试",
        });
      }

      return toSingleDto(context.db, created);
    }),

  list: protectedProcedure
    .input(
      z
        .object({
          matterId: z.string().min(1).optional(),
          status: z.enum(["open", "resolved"]).optional(),
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

      const where = and(
        eq(matter.teamId, teamId),
        ...(input.matterId === undefined
          ? []
          : [eq(exceptionEvent.matterId, input.matterId)]),
        ...(input.status === undefined
          ? []
          : [eq(exceptionEvent.status, input.status)])
      );

      const total =
        context.db
          .select({ value: count() })
          .from(exceptionEvent)
          .innerJoin(matter, eq(exceptionEvent.matterId, matter.id))
          .where(where)
          .all()[0]?.value ?? 0;

      const rows = context.db
        .select({ event: exceptionEvent })
        .from(exceptionEvent)
        .innerJoin(matter, eq(exceptionEvent.matterId, matter.id))
        .where(where)
        .orderBy(desc(exceptionEvent.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize)
        .all();

      return {
        items: loadExceptionDtos(
          context.db,
          rows.map((row) => row.event)
        ),
        page: input.page,
        pageSize: input.pageSize,
        total,
      };
    }),

  resolve: adminProcedure
    .input(
      z.object({
        id: z.string().min(1),
        resolution: z.string().trim().min(1).max(500),
      })
    )
    .handler(async ({ context, input }) => {
      const current = loadExceptionRow(context.db, input.id);

      if (current === undefined) {
        throw new ORPCError("NOT_FOUND", { message: "异常事件不存在" });
      }

      await assertMatterAccess(context.db, context.user, current.matterId);

      if (current.status === "resolved") {
        throw new ORPCError("CONFLICT", { message: "该异常事件已处置" });
      }

      const [updated] = context.db
        .update(exceptionEvent)
        .set({
          resolution: input.resolution,
          resolvedAt: new Date(),
          resolvedByName: context.user.name,
          resolvedByUserId: context.user.id,
          status: "resolved",
        })
        .where(eq(exceptionEvent.id, current.id))
        .returning()
        .all();

      if (updated === undefined) {
        throw new ORPCError("NOT_FOUND", { message: "异常事件不存在" });
      }

      return toSingleDto(context.db, updated);
    }),
};
