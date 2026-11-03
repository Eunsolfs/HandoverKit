import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { z } from "zod";

import type { AppRouterClient } from "@handoverkit/api";

import { e2eBaseURL } from "./server.ts";

/** 种子超级管理员的默认密码（见 apps/server/.env.example）。 */
export const password = "Admin@123456";

const captchaSchema = z.object({
  id: z.string(),
  svg: z.string(),
});

export interface CaptchaChallenge {
  id: string;
  svg: string;
  code: string;
}

/** 读取图形验证码；SVG 中字符以 <text> 呈现，测试里直接提取。 */
export const fetchCaptcha = async (): Promise<CaptchaChallenge> => {
  const response = await fetch(`${e2eBaseURL}/api/captcha`);

  if (!response.ok) {
    throw new Error(`Captcha failed with ${response.status}`);
  }

  const data = captchaSchema.parse(await response.json());

  const code = [...data.svg.matchAll(/<text[^>]*>(?<char>[^<]+)<\/text>/gu)]
    .map((match) => match.groups?.char ?? "")
    .join("");

  return { code, id: data.id, svg: data.svg };
};

/** 通过真实登录接口登录并返回带会话 Cookie 的 oRPC 客户端。 */
export const login = async (username = "admin", loginPassword = password) => {
  const captcha = await fetchCaptcha();

  const response = await fetch(`${e2eBaseURL}/api/login`, {
    body: JSON.stringify({
      captchaAnswer: captcha.code,
      captchaId: captcha.id,
      password: loginPassword,
      username,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Login failed with ${response.status}`);
  }

  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .join("; ");

  const client: AppRouterClient = createORPCClient(
    new RPCLink({ headers: { cookie }, url: `${e2eBaseURL}/rpc` })
  );

  return { client, cookie, username };
};
