import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  setCredentialPassword,
  verifyCredentialPassword,
} from "@handoverkit/auth";
import { matter, team } from "@handoverkit/db/schema/handover";

import { isSuperAdmin } from "#src/authz.ts";
import type { Profile } from "#src/context.ts";
import { protectedProcedure } from "#src/procedures.ts";

const teamDto = (row: typeof team.$inferSelect) => ({
  code: row.code,
  createdAt: row.createdAt,
  description: row.description,
  id: row.id,
  memberCount: 0,
  matterCount: 0,
  name: row.name,
  status: row.status,
  timezone: row.timezone,
});

const profileDto = (profile: Profile) => ({
  email: profile.email,
  id: profile.id,
  name: profile.name,
  phone: profile.phone,
  role: profile.role,
  status: profile.status,
  teamId: profile.teamId,
  username: profile.username ?? "",
});

export const meRouter = {
  get: protectedProcedure.handler(({ context }) => {
    const profile = context.user;

    const teams = isSuperAdmin(profile)
      ? context.db.select().from(team).orderBy(team.createdAt).all()
      : [];

    const teamId = profile.teamId ?? teams[0]?.id ?? null;

    const currentTeam =
      teamId === null
        ? null
        : (context.db
            .select()
            .from(team)
            .where(eq(team.id, teamId))
            .limit(1)
            .all()[0] ?? null);

    const matters =
      teamId === null
        ? []
        : context.db
            .select()
            .from(matter)
            .where(eq(matter.teamId, teamId))
            .orderBy(matter.createdAt)
            .all();

    return {
      matters: matters.map((row) => ({
        code: row.code,
        createdAt: row.createdAt,
        description: row.description,
        id: row.id,
        itemCount: 0,
        name: row.name,
        qrChangedAt: row.qrChangedAt,
        qrToken: row.qrToken,
        qrVersion: row.qrVersion,
        status: row.status,
        teamId: row.teamId,
        teamName: currentTeam?.name ?? "",
        todayStatus: null,
      })),
      team: currentTeam ? teamDto(currentTeam) : null,
      teams: teams.map(teamDto),
      user: {
        ...profileDto(profile),
        teamName: currentTeam?.name ?? null,
      },
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
