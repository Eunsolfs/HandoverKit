import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";

import { matter, subWarehouse, team } from "@handoverkit/db/schema/handover";

import type { Profile, Context } from "#src/context.ts";

export const isSuperAdmin = (profile: Profile) =>
  profile.role === "super_admin";

export const isAdmin = (profile: Profile) =>
  profile.role === "super_admin" || profile.role === "team_admin";

/**
 * 解析本次请求操作的团队：
 * - 超级管理员：显式 teamId 优先，否则取最早创建的团队（无团队时提示先创建）。
 * - 其他角色：固定为自己所属团队，传入其他团队直接 NOT_FOUND（不泄露存在性）。
 */
export const resolveTeamId = async (
  db: Context["db"],
  profile: Profile,
  teamId?: string | null
): Promise<string> => {
  if (isSuperAdmin(profile)) {
    if (teamId !== null && teamId !== undefined && teamId !== "") {
      const [row] = await db
        .select({ id: team.id })
        .from(team)
        .where(eq(team.id, teamId))
        .limit(1);

      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "团队不存在" });
      }

      return row.id;
    }

    const [first] = await db
      .select({ id: team.id })
      .from(team)
      .where(eq(team.status, "active"))
      .orderBy(team.createdAt)
      .limit(1);

    if (!first) {
      throw new ORPCError("CONFLICT", { message: "请先创建一个团队" });
    }

    return first.id;
  }

  if (profile.teamId === null) {
    throw new ORPCError("FORBIDDEN", {
      message: "账号未加入团队，请联系管理员",
    });
  }

  if (teamId !== null && teamId !== undefined && teamId !== profile.teamId) {
    throw new ORPCError("NOT_FOUND", { message: "团队不存在" });
  }

  return profile.teamId;
};

/** 校验当前用户确有该团队的数据访问权（不返回是否存在）。 */
export const assertTeamAccess = (profile: Profile, teamId: string) => {
  if (isSuperAdmin(profile)) {
    return;
  }

  if (profile.teamId !== teamId) {
    throw new ORPCError("NOT_FOUND", { message: "资源不存在" });
  }
};

export interface MatterAccess {
  id: string;
  teamId: string;
  qrToken: string;
  qrVersion: number;
  status: string;
}

/** 归档事项不允许继续扫码、生成记录或登记用物。 */
export const assertMatterActive = (access: MatterAccess) => {
  if (access.status !== "active") {
    throw new ORPCError("CONFLICT", {
      message: "该交接事项已归档，无法继续使用",
    });
  }
};

/** 取交接事项并校验团队隔离；越权统一 NOT_FOUND。 */
export const assertMatterAccess = async (
  db: Context["db"],
  profile: Profile,
  matterId: string
): Promise<MatterAccess> => {
  const [row] = await db
    .select({
      id: matter.id,
      qrToken: matter.qrToken,
      qrVersion: matter.qrVersion,
      status: matter.status,
      teamId: matter.teamId,
    })
    .from(matter)
    .where(eq(matter.id, matterId))
    .limit(1);

  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "交接事项不存在" });
  }

  assertTeamAccess(profile, row.teamId);

  return row;
};

export interface SubWarehouseAccess {
  id: string;
  matterId: string;
  teamId: string;
  name: string;
  status: string;
}

/** 取子仓库并校验团队隔离；越权统一 NOT_FOUND。 */
export const assertSubWarehouseAccess = async (
  db: Context["db"],
  profile: Profile,
  id: string
): Promise<SubWarehouseAccess> => {
  const [row] = await db
    .select({
      id: subWarehouse.id,
      matterId: subWarehouse.matterId,
      name: subWarehouse.name,
      status: subWarehouse.status,
      teamId: matter.teamId,
    })
    .from(subWarehouse)
    .innerJoin(matter, eq(subWarehouse.matterId, matter.id))
    .where(eq(subWarehouse.id, id))
    .limit(1);

  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "子仓库不存在" });
  }

  assertTeamAccess(profile, row.teamId);

  return row;
};

/** 未显式指定子仓库时取该事项最早创建且启用的子仓库。 */
export const resolveSubWarehouseId = async (
  db: Context["db"],
  profile: Profile,
  matterId: string,
  requestedId?: string
): Promise<string> => {
  if (requestedId !== undefined) {
    const access = await assertSubWarehouseAccess(db, profile, requestedId);

    if (access.matterId !== matterId) {
      throw new ORPCError("BAD_REQUEST", {
        message: "子仓库不属于该交接事项",
      });
    }

    if (access.status !== "active") {
      throw new ORPCError("CONFLICT", { message: "子仓库已停用" });
    }

    return access.id;
  }

  const [first] = await db
    .select({ id: subWarehouse.id })
    .from(subWarehouse)
    .where(
      and(
        eq(subWarehouse.matterId, matterId),
        eq(subWarehouse.status, "active")
      )
    )
    .orderBy(subWarehouse.sortOrder, subWarehouse.createdAt)
    .limit(1);

  if (first === undefined) {
    throw new ORPCError("NOT_FOUND", { message: "该事项还没有可用子仓库" });
  }

  return first.id;
};
