import { eq } from "drizzle-orm";

import { createCredentialUser } from "@handoverkit/auth";
import { user } from "@handoverkit/db/schema/auth";

import { db } from "#src/context.ts";
import { env } from "#src/env.ts";

/**
 * 首次启动时创建超级管理员（仅当系统中不存在任何超级管理员）。
 * 账号密码来自环境变量，默认值仅用于本地/首次部署，登录后请立即修改。
 */
export const ensureSeedAdmin = async () => {
  const [existing] = db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, "super_admin"))
    .limit(1)
    .all();

  if (existing) {
    return;
  }

  await createCredentialUser(db, {
    name: env.SEED_ADMIN_NAME,
    password: env.SEED_ADMIN_PASSWORD,
    role: "super_admin",
    username: env.SEED_ADMIN_USERNAME,
  });

  console.log(
    `[seed] 已创建超级管理员 ${env.SEED_ADMIN_USERNAME}，请登录后立即修改密码`
  );
};
