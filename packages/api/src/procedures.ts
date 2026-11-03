import { ORPCError, os } from "@orpc/server";
import { eq } from "drizzle-orm";

import { user } from "@handoverkit/db/schema/auth";

import type { Context } from "#src/context.ts";

export const publicProcedure = os.$context<Context>();

/** 校验登录 + 账号可用；把实时用户资料挂到 context.user。 */
export const protectedProcedure = publicProcedure.use(
  async ({ context, next }) => {
    if (!context.session) {
      throw new ORPCError("UNAUTHORIZED", { message: "请先登录" });
    }

    const [profile] = await context.db
      .select()
      .from(user)
      .where(eq(user.id, context.session.user.id))
      .limit(1);

    if (!profile || profile.status !== "active") {
      throw new ORPCError("UNAUTHORIZED", { message: "账号不存在或已停用" });
    }

    return await next({
      context: { session: context.session, user: profile },
    });
  }
);

export const adminProcedure = protectedProcedure.use(({ context, next }) => {
  if (
    context.user.role !== "super_admin" &&
    context.user.role !== "team_admin"
  ) {
    throw new ORPCError("FORBIDDEN", { message: "需要管理员权限" });
  }

  return next();
});

export const superAdminProcedure = protectedProcedure.use(
  ({ context, next }) => {
    if (context.user.role !== "super_admin") {
      throw new ORPCError("FORBIDDEN", { message: "需要超级管理员权限" });
    }

    return next();
  }
);

export type ProtectedContext = Context & {
  session: NonNullable<Context["session"]>;
  user: NonNullable<Context["user"]>;
};
