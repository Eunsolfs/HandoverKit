import { createRouterClient } from "@orpc/server";
import { afterAll } from "vite-plus/test";

import { createAuth, createCredentialUser } from "@handoverkit/auth";
import type { CredentialRole } from "@handoverkit/auth";
import { createTestDatabase } from "@handoverkit/db/testing";

import { appRouter } from "#src/index.ts";
import type { Context } from "#src/index.ts";

// 每个测试文件使用独立数据库，文件之间并行且不共享数据。
const { db, remove } = await createTestDatabase();

afterAll(remove);

const auth = createAuth({
  baseURL: "http://localhost",
  db,
  secret: "test-secret-that-is-at-least-32-characters",
});

/** 直接调用 procedure（走真实中间件与校验），可指定登录会话。 */
export const createClient = (session: Context["session"] = null) =>
  createRouterClient(appRouter, { context: { db, session, user: null } });

let counter = 0;

export interface TestUserOptions {
  role?: CredentialRole;
  teamId?: string | null;
  username?: string;
  password?: string;
  name?: string;
}

/** 创建账号并登录，返回可直接调用 procedure 的客户端。 */
export const createTestUser = async (options: TestUserOptions = {}) => {
  counter += 1;
  const username = options.username ?? `user${counter}`;
  const password = options.password ?? "correct-horse-battery";

  const userId = await createCredentialUser(db, {
    name: options.name ?? `测试用户${counter}`,
    password,
    role: options.role ?? "member",
    teamId: options.teamId ?? null,
    username,
  });

  const { headers } = await auth.api.signInUsername({
    body: { password, username },
    returnHeaders: true,
  });

  const cookie = headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .join("; ");

  const session = await auth.api.getSession({
    headers: new Headers({ cookie }),
  });

  return {
    client: createClient(session),
    cookie,
    id: userId,
    password,
    session,
    username,
  };
};

export { auth, db };

/** 为指定日期生成并确认接收交接记录（测试辅助）；返回最新记录详情。 */
export const ensureAcceptedRecord = async (
  client: ReturnType<typeof createClient>,
  matterId: string,
  date: string
) => {
  const record = await client.records.today({ matterId, date });

  if (record.permissions.canAccept) {
    await client.records.accept({
      id: record.id,
      items: record.items.map((item) => ({
        actualQty: item.expectedQty,
        checked: true,
        itemId: item.itemId,
        note: null,
      })),
    });
  }

  return record;
};
