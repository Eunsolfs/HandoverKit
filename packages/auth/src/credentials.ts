import { randomUUID } from "node:crypto";

import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";

import type { Database } from "@handoverkit/db";
import { account, user } from "@handoverkit/db/schema/auth";

export type CredentialRole = "super_admin" | "team_admin" | "member";

export interface CreateCredentialUserInput {
  username: string;
  password: string;
  name: string;
  role: CredentialRole;
  teamId?: string | null;
  phone?: string | null;
  email?: string;
}

const normalizeUsername = (value: string) => value.trim().toLowerCase();

/**
 * 创建可登录账号：user 行 + credential account（scrypt 哈希）。
 * Better Auth 的 email/password 登录读取 providerId = "credential" 的 account。
 */
export const createCredentialUser = async (
  db: Database,
  input: CreateCredentialUserInput
): Promise<string> => {
  const username = normalizeUsername(input.username);
  const passwordHash = await hashPassword(input.password);
  const userId = randomUUID();
  const email = input.email ?? `${username}@handoverkit.local`;

  db.transaction((tx) => {
    tx.insert(user)
      .values({
        displayUsername: input.username.trim(),
        email,
        emailVerified: true,
        id: userId,
        name: input.name.trim(),
        phone: input.phone ?? null,
        role: input.role,
        status: "active",
        teamId: input.teamId ?? null,
        username,
      })
      .run();

    tx.insert(account)
      .values({
        accountId: userId,
        id: randomUUID(),
        password: passwordHash,
        providerId: "credential",
        userId,
      })
      .run();
  });

  return userId;
};

/** 管理员重置密码；账号不存在时抛错由调用方转成 NOT_FOUND。 */
export const setCredentialPassword = async (
  db: Database,
  userId: string,
  newPassword: string
): Promise<void> => {
  const passwordHash = await hashPassword(newPassword);

  const [existing] = db
    .select({ id: account.id })
    .from(account)
    .where(
      and(eq(account.userId, userId), eq(account.providerId, "credential"))
    )
    .limit(1)
    .all();

  if (existing) {
    db.update(account)
      .set({ password: passwordHash })
      .where(eq(account.id, existing.id))
      .run();

    return;
  }

  db.insert(account)
    .values({
      accountId: userId,
      id: randomUUID(),
      password: passwordHash,
      providerId: "credential",
      userId,
    })
    .run();
};

/** 校验当前密码（修改密码时使用）。 */
export const verifyCredentialPassword = async (
  db: Database,
  userId: string,
  password: string
): Promise<boolean> => {
  const [existing] = db
    .select({ password: account.password })
    .from(account)
    .where(
      and(eq(account.userId, userId), eq(account.providerId, "credential"))
    )
    .limit(1)
    .all();

  if (existing === undefined || existing.password === null) {
    return false;
  }

  return await verifyPassword({ hash: existing.password, password });
};
