import type { Session } from "@handoverkit/auth";
import type { Database } from "@handoverkit/db";

export interface Context {
  db: Database;
  session: Session | null;
}
