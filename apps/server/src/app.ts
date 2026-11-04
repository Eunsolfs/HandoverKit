import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";

import { user } from "@handoverkit/db/schema/auth";
import { item, itemImage, matter } from "@handoverkit/db/schema/handover";

import { auth, db } from "#src/context.ts";
import { loginRoutes } from "#src/login.ts";
import { openApi, rpc } from "#src/orpc.ts";

const authHandler = async (c: Context) => await auth.handler(c.req.raw);

/** 产品图读取：必须登录且属于同一团队；图片内容很小，直接返回内存缓存友好的缩略图。 */
const itemImageHandler = async (c: Context) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (session === null) {
    return await c.notFound();
  }

  const itemId = c.req.param("itemId");

  if (itemId === undefined) {
    return await c.notFound();
  }

  const [profile] = db
    .select({ role: user.role, teamId: user.teamId })
    .from(user)
    .where(eq(user.id, session.user.id))
    .all();

  if (profile === undefined) {
    return await c.notFound();
  }

  const [row] = db
    .select({
      data: itemImage.data,
      mime: itemImage.mime,
      teamId: matter.teamId,
    })
    .from(itemImage)
    .innerJoin(item, eq(itemImage.itemId, item.id))
    .innerJoin(matter, eq(item.matterId, matter.id))
    .where(eq(item.id, itemId))
    .all();

  if (
    row === undefined ||
    (profile.role !== "super_admin" && profile.teamId !== row.teamId)
  ) {
    return await c.notFound();
  }

  const bytes = Buffer.from(row.data, "base64");

  return new Response(bytes, {
    headers: {
      "Cache-Control": "private, max-age=86400",
      "Content-Length": String(bytes.length),
      "Content-Type": row.mime,
    },
  });
};

export const app = new Hono()
  .use(logger())
  .use(secureHeaders())
  .route("/", loginRoutes)
  .on(["GET", "POST"], "/api/auth/*", authHandler)
  .get("/api/items/:itemId/image", itemImageHandler)
  .all("/rpc/*", rpc)
  .all("/api/*", openApi);
