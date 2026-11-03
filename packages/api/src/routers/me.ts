import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  setCredentialPassword,
  verifyCredentialPassword,
} from "@handoverkit/auth";
import { matter, team } from "@handoverkit/db/schema/handover";

import { isSuperAdmin } from "#src/authz.ts";
import { toProfileDto } from "#src/dto.ts";
import type { TeamDto } from "#src/dto.ts";
import { todayInTimeZone } from "#src/lib/dates.ts";
import { loadMatterDtos, loadTeamDto, loadTeamDtos } from "#src/lib/loaders.ts";
import { protectedProcedure } from "#src/procedures.ts";

/** 当前用户资料 + 所在/当前团队 + 可访问交接事项。超级管理员可传 teamId 切换团队。 */
export const meRouter = {
  get: protectedProcedure
    .input(z.object({ teamId: z.string().min(1).optional() }).optional())
    .handler(({ context, input }) => {
      const profile = context.user;

      const teams = isSuperAdmin(profile)
        ? loadTeamDtos(
            context.db,
            context.db.select().from(team).orderBy(team.createdAt).all()
          )
        : [];

      const requestedTeamId = input?.teamId ?? null;

      if (
        requestedTeamId !== null &&
        !isSuperAdmin(profile) &&
        requestedTeamId !== profile.teamId
      ) {
        throw new ORPCError("NOT_FOUND", { message: "团队不存在" });
      }

      const teamId = requestedTeamId ?? profile.teamId ?? teams[0]?.id ?? null;

      let currentTeam: TeamDto | null = null;

      if (teamId !== null) {
        const [row] = context.db
          .select()
          .from(team)
          .where(eq(team.id, teamId))
          .limit(1)
          .all();

        if (row !== undefined) {
          currentTeam = loadTeamDto(context.db, row);
        }
      }

      const recordDate = todayInTimeZone(
        currentTeam?.timezone ?? "Asia/Shanghai"
      );

      const matters =
        teamId === null
          ? []
          : loadMatterDtos(
              context.db,
              context.db
                .select()
                .from(matter)
                .where(eq(matter.teamId, teamId))
                .orderBy(matter.createdAt)
                .all(),
              recordDate
            );

      return {
        matters,
        team: currentTeam,
        teams,
        user: toProfileDto(profile, currentTeam?.name ?? null),
      };
    }),

  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1).max(128),
        newPassword: z
          .string()
          .min(8)
          .max(128)
          .regex(/[a-zA-Z]/u, "密码需包含字母")
          .regex(/[0-9]/u, "密码需包含数字"),
      })
    )
    .handler(async ({ context, input }) => {
      const ok = await verifyCredentialPassword(
        context.db,
        context.user.id,
        input.currentPassword
      );

      if (!ok) {
        throw new ORPCError("BAD_REQUEST", { message: "当前密码不正确" });
      }

      await setCredentialPassword(
        context.db,
        context.user.id,
        input.newPassword
      );

      return { ok: true as const };
    }),
};
