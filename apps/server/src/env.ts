import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  server: {
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    DATABASE_URL: z.string().min(1),
    PORT: z.coerce.number().int().positive().default(3000),
    // 首次启动时创建超级管理员（仅在系统内没有任何超级管理员时生效）
    SEED_ADMIN_NAME: z.string().min(1).max(60).default("系统管理员"),
    SEED_ADMIN_PASSWORD: z.string().min(8).max(128).default("Admin@123456"),
    SEED_ADMIN_USERNAME: z.string().min(3).max(30).default("admin"),
  },
});
