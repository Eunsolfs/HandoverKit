import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";

import type { Database } from "@handoverkit/db";
import * as schema from "@handoverkit/db/schema/auth";

interface AuthOptions {
  db: Database;
  baseURL: string;
  secret: string;
}

/**
 * 账号体系约定：
 * - 系统不开放自助注册（账号由管理员创建），因此禁用邮箱注册入口。
 * - 登录标识为 username（大小写不敏感），由 username 插件提供 `/sign-in/username`。
 * - 业务字段（role/teamId/status/phone）与 Better Auth 的 user 表共用一张表，但每次请求由
 *   API 层实时读取，保证停用账号立即失效。
 */
export const createAuth = ({ db, baseURL, secret }: AuthOptions) =>
  betterAuth({
    baseURL,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    plugins: [
      username({
        maxUsernameLength: 30,
        minUsernameLength: 3,
        usernameValidator: (value) => /^[a-zA-Z0-9_.]+$/u.test(value),
      }),
    ],
    secret,
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
  });

export type Auth = ReturnType<typeof createAuth>;

export type Session = Auth["$Infer"]["Session"];

export {
  CAPTCHA_TTL_MS,
  createCaptcha,
  verifyCaptcha,
  type CaptchaChallenge,
} from "./captcha.ts";

export {
  createCredentialUser,
  setCredentialPassword,
  verifyCredentialPassword,
  type CreateCredentialUserInput,
  type CredentialRole,
} from "./credentials.ts";
