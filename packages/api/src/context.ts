import type { Session } from "@handoverkit/auth";
import type { Database } from "@handoverkit/db";
import type { user } from "@handoverkit/db/schema/auth";

export type Profile = typeof user.$inferSelect;

export interface Context {
  db: Database;
  session: Session | null;
  /** 登录用户的实时资料（角色/团队/状态每次请求从数据库读取）。 */
  user: Profile | null;
}
