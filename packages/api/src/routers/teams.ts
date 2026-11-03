import { ORPCError } from "@orpc/server";
import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { user } from "@handoverkit/db/schema/auth";
import { matter, team } from "@handoverkit/db/schema/handover";

import { isValidTimeZone } from "#src/lib/dates.ts";
import { loadTeamDto, loadTeamDtos } from "#src/lib/loaders.ts";
import { superAdminProcedure } from "#src/procedures.ts";

const timezoneSchema = z
  .string()
  .refine(isValidTimeZone, "时区无效，请填写 IANA 时区，如 Asia/Shanghai");

const isUniqueViolation = (error: Error): boolean =>
  error.message.includes("UNIQUE constraint failed");

export const teamsRouter = {
  create: superAdminProcedure
    .input(
      z.object({
        code: z
          .string()
          .trim()
          .min(2)
          .max(20)
          .regex(/^[A-Z0-9-]+$/u, "团队编码只能包含大写字母、数字与短横线"),
        description: z.string().trim().max(200).optional(),
        name: z.string().trim().min(1).max(60),
        timezone: timezoneSchema.optional(),
      })
    )
    .handler(({ context, input }) => {
      const [nameTaken] = context.db
        .select({ id: team.id })
        .from(team)
        .where(eq(team.name, input.name))
        .all();

      const [codeTaken] = context.db
        .select({ id: team.id })
        .from(team)
        .where(eq(team.code, input.code))
        .all();

      if (nameTaken !== undefined) {
        throw new ORPCError("CONFLICT", { message: "团队名称已存在" });
      }

      if (codeTaken !== undefined) {
        throw new ORPCError("CONFLICT", { message: "团队编码已存在" });
      }

      try {
        const [created] = context.db
          .insert(team)
          .values({
            code: input.code,
            description: input.description ?? null,
            name: input.name,
            timezone: input.timezone ?? "Asia/Shanghai",
          })
          .returning()
          .all();

        if (created === undefined) {
          throw new ORPCError("CONFLICT", { message: "团队创建失败，请重试" });
        }

        return loadTeamDto(context.db, created);
      } catch (error) {
        if (error instanceof Error && isUniqueViolation(error)) {
          throw new ORPCError("CONFLICT", {
            message: "团队名称或编码已存在",
          });
        }

        throw error;
      }
    }),

  list: superAdminProcedure.handler(({ context }) =>
    loadTeamDtos(
      context.db,
      context.db.select().from(team).orderBy(team.createdAt).all()
    )
  ),

  remove: superAdminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(({ context, input }) => {
      const [target] = context.db
        .select()
        .from(team)
        .where(eq(team.id, input.id))
        .all();

      if (target === undefined) {
        throw new ORPCError("NOT_FOUND", { message: "团队不存在" });
      }

      const [memberCountRow] = context.db
        .select({ value: count() })
        .from(user)
        .where(eq(user.teamId, target.id))
        .all();

      const [matterCountRow] = context.db
        .select({ value: count() })
        .from(matter)
        .where(eq(matter.teamId, target.id))
        .all();

      if (
        (memberCountRow?.value ?? 0) > 0 ||
        (matterCountRow?.value ?? 0) > 0
      ) {
        throw new ORPCError("CONFLICT", {
          message: "团队下存在用户或交接事项，请先转移或归档",
        });
      }

      context.db.delete(team).where(eq(team.id, target.id)).run();

      return { ok: true as const };
    }),

  update: superAdminProcedure
    .input(
      z.object({
        description: z.string().trim().max(200).nullish(),
        id: z.string().min(1),
        name: z.string().trim().min(1).max(60).optional(),
        status: z.enum(["active", "archived"]).optional(),
        timezone: timezoneSchema.optional(),
      })
    )
    .handler(({ context, input }) => {
      const [target] = context.db
        .select()
        .from(team)
        .where(eq(team.id, input.id))
        .all();

      if (target === undefined) {
        throw new ORPCError("NOT_FOUND", { message: "团队不存在" });
      }

      if (input.name !== undefined && input.name !== target.name) {
        const [taken] = context.db
          .select({ id: team.id })
          .from(team)
          .where(and(eq(team.name, input.name), ne(team.id, target.id)))
          .all();

        if (taken !== undefined) {
          throw new ORPCError("CONFLICT", { message: "团队名称已存在" });
        }
      }

      const patch: Partial<typeof team.$inferInsert> = {};

      if (input.description !== undefined) {
        patch.description = input.description;
      }

      if (input.name !== undefined) {
        patch.name = input.name;
      }

      if (input.status !== undefined) {
        patch.status = input.status;
      }

      if (input.timezone !== undefined) {
        patch.timezone = input.timezone;
      }

      try {
        const [updated] = context.db
          .update(team)
          .set(patch)
          .where(eq(team.id, target.id))
          .returning()
          .all();

        if (updated === undefined) {
          throw new ORPCError("NOT_FOUND", { message: "团队不存在" });
        }

        return loadTeamDto(context.db, updated);
      } catch (error) {
        if (error instanceof Error && isUniqueViolation(error)) {
          throw new ORPCError("CONFLICT", { message: "团队名称已存在" });
        }

        throw error;
      }
    }),
};
