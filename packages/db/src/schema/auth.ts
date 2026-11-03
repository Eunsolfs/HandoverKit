import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  snakeCase,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(cast(unixepoch('subsec') * 1000 as integer))`;

const timestamp = () => integer({ mode: "timestamp_ms" });

const timestamps = {
  createdAt: timestamp().notNull().default(now),
  updatedAt: timestamp()
    .notNull()
    .default(now)
    .$onUpdate(() => new Date()),
};

export const ROLE_VALUES = ["super_admin", "team_admin", "member"] as const;
export const USER_STATUS_VALUES = ["active", "disabled"] as const;

export const user = snakeCase.table(
  "user",
  {
    email: text().notNull().unique(),
    emailVerified: integer({ mode: "boolean" }).notNull().default(false),
    id: text().primaryKey(),
    image: text(),
    name: text().notNull(),
    // Better Auth username plugin fields（插件要求的字段可空；业务创建账号时必填）
    username: text(),
    displayUsername: text(),
    // 易交接业务字段（每次请求从数据库实时读取，保证停用/改角色立即生效）
    role: text().notNull().default("member"),
    teamId: text(),
    status: text().notNull().default("active"),
    phone: text(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("user_username_unique").on(table.username),
    index("user_team_idx").on(table.teamId),
    check(
      "user_role_check",
      sql`${table.role} in ('super_admin', 'team_admin', 'member')`
    ),
    check("user_status_check", sql`${table.status} in ('active', 'disabled')`),
    check(
      "user_username_length",
      sql`${table.username} is null or length(${table.username}) between 3 and 30`
    ),
  ]
);

export const session = snakeCase.table(
  "session",
  {
    expiresAt: timestamp().notNull(),
    id: text().primaryKey(),
    ipAddress: text(),
    token: text().notNull().unique(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [index("session_user_id_idx").on(table.userId)]
);

export const account = snakeCase.table(
  "account",
  {
    accessToken: text(),
    accessTokenExpiresAt: timestamp(),
    accountId: text().notNull(),
    id: text().primaryKey(),
    idToken: text(),
    password: text(),
    providerId: text().notNull(),
    refreshToken: text(),
    refreshTokenExpiresAt: timestamp(),
    scope: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [index("account_user_id_idx").on(table.userId)]
);

export const verification = snakeCase.table(
  "verification",
  {
    expiresAt: timestamp().notNull(),
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    ...timestamps,
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);
