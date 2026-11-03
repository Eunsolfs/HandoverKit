import { ORPCError } from "@orpc/server";
import type { SQL } from "drizzle-orm";
import { and, count, eq, like, or } from "drizzle-orm";
import { z } from "zod";

import { createCredentialUser, setCredentialPassword } from "@handoverkit/auth";
import type { Database } from "@handoverkit/db";
import { user } from "@handoverkit/db/schema/auth";
import {
  exceptionEvent,
  handoverRecord,
  revokeRequest,
  stockMovement,
  usageRecord,
} from "@handoverkit/db/schema/handover";

import { assertTeamAccess, isSuperAdmin, resolveTeamId } from "#src/authz.ts";
import type { Profile } from "#src/context.ts";
import type { ProfileDto } from "#src/dto.ts";
import { loadProfileDtos, loadTeamRow } from "#src/lib/loaders.ts";
import { adminProcedure } from "#src/procedures.ts";

type UserRow = typeof user.$inferSelect;

interface UserUpdateInput {
  name?: string;
  phone?: string | null;
  role?: "team_admin" | "member";
  status?: "active" | "disabled";
  teamId?: string;
}

const passwordSchema = z
  .string()
  .min(8, "密码至少 8 位")
  .max(128, "密码最多 128 位")
  .regex(/[a-zA-Z]/u, "密码需包含字母")
  .regex(/[0-9]/u, "密码需包含数字");

const usernameSchema = z
  .string()
  .trim()
  .min(3, "登录名至少 3 个字符")
  .max(30, "登录名最多 30 个字符")
  .regex(/^[a-zA-Z0-9_.]+$/u, "登录名只能包含字母、数字、下划线与点");

const isUniqueViolation = (error: Error): boolean =>
  error.message.includes("UNIQUE constraint failed");

const loadUserRow = (db: Database, id: string): UserRow | undefined => {
  const [row] = db.select().from(user).where(eq(user.id, id)).all();

  return row;
};

const requireUserRow = (db: Database, id: string): UserRow => {
  const row = loadUserRow(db, id);

  if (row === undefined) {
    throw new ORPCError("NOT_FOUND", { message: "用户不存在" });
  }

  return row;
};

/** 团队管理员只能管理本团队用户；超级管理员不受限。越权统一 NOT_FOUND。 */
const requireUserManageable = (
  db: Database,
  profile: Profile,
  id: string
): UserRow => {
  const target = requireUserRow(db, id);
  const outOfTeam = profile.teamId === null || target.teamId !== profile.teamId;

  if (!isSuperAdmin(profile) && outOfTeam) {
    throw new ORPCError("NOT_FOUND", { message: "用户不存在" });
  }

  return target;
};

const toSingleDto = (db: Database, row: UserRow): ProfileDto => {
  const [dto] = loadProfileDtos(db, [row]);

  if (dto === undefined) {
    throw new ORPCError("NOT_FOUND", { message: "用户不存在" });
  }

  return dto;
};

const hasBusinessRecords = (db: Database, userId: string): boolean => {
  const [usageRow] = db
    .select({ value: count() })
    .from(usageRecord)
    .where(eq(usageRecord.operatorUserId, userId))
    .all();

  if ((usageRow?.value ?? 0) > 0) {
    return true;
  }

  const [recordRow] = db
    .select({ value: count() })
    .from(handoverRecord)
    .where(
      or(
        eq(handoverRecord.acceptedByUserId, userId),
        eq(handoverRecord.handoverByUserId, userId)
      )
    )
    .all();

  if ((recordRow?.value ?? 0) > 0) {
    return true;
  }

  const [exceptionRow] = db
    .select({ value: count() })
    .from(exceptionEvent)
    .where(
      or(
        eq(exceptionEvent.reportedByUserId, userId),
        eq(exceptionEvent.resolvedByUserId, userId)
      )
    )
    .all();

  if ((exceptionRow?.value ?? 0) > 0) {
    return true;
  }

  const [movementRow] = db
    .select({ value: count() })
    .from(stockMovement)
    .where(eq(stockMovement.operatorUserId, userId))
    .all();

  if ((movementRow?.value ?? 0) > 0) {
    return true;
  }

  const [revokeRow] = db
    .select({ value: count() })
    .from(revokeRequest)
    .where(
      or(
        eq(revokeRequest.requestedByUserId, userId),
        eq(revokeRequest.reviewedByUserId, userId)
      )
    )
    .all();

  return (revokeRow?.value ?? 0) > 0;
};

const assertSelfUpdate = (
  profile: Profile,
  target: UserRow,
  input: UserUpdateInput
) => {
  if (target.id !== profile.id) {
    return;
  }

  if (input.role !== undefined && input.role !== target.role) {
    throw new ORPCError("FORBIDDEN", { message: "不能修改自己的角色" });
  }

  if (input.status !== undefined && input.status !== target.status) {
    throw new ORPCError("FORBIDDEN", { message: "不能修改自己的账号状态" });
  }
};

const assertTeamAdminUpdate = (
  profile: Profile,
  target: UserRow,
  input: UserUpdateInput
) => {
  if (target.role !== "member" && target.id !== profile.id) {
    throw new ORPCError("FORBIDDEN", {
      message: "团队管理员只能管理普通成员",
    });
  }

  if (
    input.role !== undefined &&
    input.role !== target.role &&
    input.role !== "member"
  ) {
    throw new ORPCError("FORBIDDEN", {
      message: "团队管理员只能把用户设为普通成员",
    });
  }

  if (input.teamId !== undefined) {
    throw new ORPCError("FORBIDDEN", {
      message: "团队管理员不能调整用户所属团队",
    });
  }
};

const assertSuperAdminUpdate = async (
  db: Database,
  profile: Profile,
  target: UserRow,
  input: UserUpdateInput
) => {
  if (target.role === "super_admin" && input.role !== undefined) {
    throw new ORPCError("FORBIDDEN", {
      message: "不能修改超级管理员的角色",
    });
  }

  if (input.teamId !== undefined) {
    await resolveTeamId(db, profile, input.teamId);
  }
};

export const usersRouter = {
  create: adminProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(40),
        password: passwordSchema,
        phone: z.string().trim().max(20).nullish(),
        role: z.enum(["team_admin", "member"]),
        teamId: z.string().min(1).optional(),
        username: usernameSchema,
      })
    )
    .handler(async ({ context, input }) => {
      const { teamId: ownTeamId } = context.user;
      let teamId: string;

      if (isSuperAdmin(context.user)) {
        teamId = await resolveTeamId(context.db, context.user, input.teamId);
      } else {
        if (input.role !== "member") {
          throw new ORPCError("FORBIDDEN", {
            message: "团队管理员只能创建普通成员",
          });
        }

        if (ownTeamId === null) {
          throw new ORPCError("FORBIDDEN", {
            message: "账号未加入团队，请联系超级管理员",
          });
        }

        if (input.teamId !== undefined) {
          assertTeamAccess(context.user, input.teamId);
        }

        teamId = ownTeamId;
      }

      const username = input.username.toLowerCase();

      const [taken] = context.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.username, username))
        .all();

      if (taken !== undefined) {
        throw new ORPCError("CONFLICT", { message: "登录名已被占用" });
      }

      try {
        const userId = await createCredentialUser(context.db, {
          name: input.name,
          password: input.password,
          phone: input.phone ?? null,
          role: input.role,
          teamId,
          username,
        });

        const created = requireUserRow(context.db, userId);

        return toSingleDto(context.db, created);
      } catch (error) {
        if (error instanceof Error && isUniqueViolation(error)) {
          throw new ORPCError("CONFLICT", { message: "登录名已被占用" });
        }

        throw error;
      }
    }),

  list: adminProcedure
    .input(
      z.object({
        q: z.string().trim().max(40).optional(),
        role: z.enum(["super_admin", "team_admin", "member"]).optional(),
        status: z.enum(["active", "disabled"]).optional(),
        teamId: z.string().min(1).optional(),
      })
    )
    .handler(({ context, input }) => {
      const conditions: (SQL | undefined)[] = [];

      if (isSuperAdmin(context.user)) {
        if (input.teamId !== undefined) {
          const teamRow = loadTeamRow(context.db, input.teamId);

          if (teamRow === undefined) {
            throw new ORPCError("NOT_FOUND", { message: "团队不存在" });
          }

          conditions.push(eq(user.teamId, input.teamId));
        }
      } else {
        if (context.user.teamId === null) {
          return [];
        }

        conditions.push(eq(user.teamId, context.user.teamId));
      }

      if (input.role !== undefined) {
        conditions.push(eq(user.role, input.role));
      }

      if (input.status !== undefined) {
        conditions.push(eq(user.status, input.status));
      }

      const keyword = input.q?.trim();

      if (keyword !== undefined && keyword.length > 0) {
        const pattern = `%${keyword}%`;

        conditions.push(
          or(
            like(user.name, pattern),
            like(user.username, pattern.toLowerCase()),
            like(user.phone, pattern)
          )
        );
      }

      const rows = context.db
        .select()
        .from(user)
        .where(and(...conditions))
        .orderBy(user.createdAt)
        .all();

      return loadProfileDtos(context.db, rows);
    }),

  remove: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(({ context, input }) => {
      const target = requireUserManageable(context.db, context.user, input.id);

      if (target.id === context.user.id) {
        throw new ORPCError("BAD_REQUEST", {
          message: "不能删除自己的账号",
        });
      }

      if (target.role === "super_admin") {
        throw new ORPCError("FORBIDDEN", {
          message: "不能删除超级管理员账号",
        });
      }

      if (!isSuperAdmin(context.user) && target.role !== "member") {
        throw new ORPCError("FORBIDDEN", {
          message: "团队管理员只能删除普通成员",
        });
      }

      if (hasBusinessRecords(context.db, target.id)) {
        throw new ORPCError("CONFLICT", {
          message: "该用户已有业务记录，请改为停用",
        });
      }

      context.db.delete(user).where(eq(user.id, target.id)).run();

      return { ok: true as const };
    }),

  resetPassword: adminProcedure
    .input(
      z.object({
        id: z.string().min(1),
        newPassword: passwordSchema,
      })
    )
    .handler(async ({ context, input }) => {
      const target = requireUserManageable(context.db, context.user, input.id);

      const forbiddenTarget =
        !isSuperAdmin(context.user) &&
        target.role !== "member" &&
        target.id !== context.user.id;

      if (forbiddenTarget) {
        throw new ORPCError("FORBIDDEN", {
          message: "团队管理员只能重置普通成员的密码",
        });
      }

      await setCredentialPassword(context.db, target.id, input.newPassword);

      return { ok: true as const };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1).max(40).optional(),
        phone: z.string().trim().max(20).nullish(),
        role: z.enum(["team_admin", "member"]).optional(),
        status: z.enum(["active", "disabled"]).optional(),
        teamId: z.string().min(1).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const target = requireUserManageable(context.db, context.user, input.id);

      assertSelfUpdate(context.user, target, input);

      if (isSuperAdmin(context.user)) {
        await assertSuperAdminUpdate(context.db, context.user, target, input);
      } else {
        assertTeamAdminUpdate(context.user, target, input);
      }

      const patch: Partial<typeof user.$inferInsert> = {};

      if (input.name !== undefined) {
        patch.name = input.name;
      }

      if (input.phone !== undefined) {
        patch.phone = input.phone;
      }

      if (input.role !== undefined) {
        patch.role = input.role;
      }

      if (input.status !== undefined) {
        patch.status = input.status;
      }

      if (input.teamId !== undefined) {
        patch.teamId = input.teamId;
      }

      const [updated] = context.db
        .update(user)
        .set(patch)
        .where(eq(user.id, target.id))
        .returning()
        .all();

      if (updated === undefined) {
        throw new ORPCError("NOT_FOUND", { message: "用户不存在" });
      }

      return toSingleDto(context.db, updated);
    }),
};
