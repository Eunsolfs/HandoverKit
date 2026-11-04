import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { createCaptcha, verifyCaptcha } from "@handoverkit/auth";
import { user } from "@handoverkit/db/schema/auth";

import { auth, db } from "#src/context.ts";

const WINDOW_MS = 5 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, { count: number; resetAt: number }>();

const clientIp = (headers: Headers) =>
  headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
  headers.get("x-real-ip") ??
  "local";

const isRateLimited = (ip: string) => {
  const entry = failures.get(ip);

  if (!entry) {
    return false;
  }

  if (entry.resetAt <= Date.now()) {
    failures.delete(ip);

    return false;
  }

  return entry.count >= MAX_FAILURES;
};

const recordFailure = (ip: string) => {
  const now = Date.now();
  const entry = failures.get(ip);

  if (!entry || entry.resetAt <= now) {
    failures.set(ip, { count: 1, resetAt: now + WINDOW_MS });

    return;
  }

  entry.count += 1;
};

const loginSchema = z.object({
  captchaAnswer: z.string().trim().min(1).max(10),
  captchaId: z.string().min(1),
  password: z.string().min(4).max(128),
  username: z.string().trim().min(3).max(30),
});

export const loginRoutes = new Hono()
  .get("/api/captcha", (c) => {
    const challenge = createCaptcha();

    return c.json(
      { expiresAt: challenge.expiresAt, id: challenge.id, svg: challenge.svg },
      200,
      { "Cache-Control": "no-store" }
    );
  })
  .post("/api/login", async (c) => {
    const ip = clientIp(c.req.raw.headers);

    if (isRateLimited(ip)) {
      return c.json({ error: "尝试次数过多，请 5 分钟后再试" }, 429);
    }

    let payload: unknown;

    try {
      payload = await c.req.json();
    } catch {
      return c.json({ error: "请求格式不正确" }, 400);
    }

    const parsed = loginSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json({ error: "请填写完整的登录信息" }, 400);
    }

    const { captchaAnswer, captchaId, password, username } = parsed.data;

    if (!verifyCaptcha(captchaId, captchaAnswer)) {
      recordFailure(ip);

      return c.json({ error: "验证码错误或已过期" }, 400);
    }

    const normalized = username.toLowerCase();

    const [profile] = await db
      .select({
        id: user.id,
        role: user.role,
        status: user.status,
      })
      .from(user)
      .where(eq(user.username, normalized))
      .limit(1);

    if (!profile) {
      recordFailure(ip);

      return c.json({ error: "登录名或密码错误" }, 401);
    }

    if (profile.status !== "active") {
      return c.json({ error: "账号已停用，请联系管理员" }, 403);
    }

    try {
      const response = await auth.api.signInUsername({
        asResponse: true,
        body: { password, username: normalized },
        headers: c.req.raw.headers,
      });

      if (!response.ok) {
        recordFailure(ip);

        return c.json({ error: "登录名或密码错误" }, 401);
      }

      failures.delete(ip);

      return c.newResponse(response.body, response);
    } catch {
      recordFailure(ip);

      return c.json({ error: "登录名或密码错误" }, 401);
    }
  });
