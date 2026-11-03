import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { password } from "../support/api.ts";

const ADMIN_USERNAME = "admin";
const WRONG_CAPTCHA = "0000";

const isCaptchaPayload = (value: unknown): value is { svg: string } =>
  typeof value === "object" &&
  value !== null &&
  "svg" in value &&
  typeof value.svg === "string";

/** 验证码字符以 SVG <text> 渲染（/api/captcha 契约），从响应里提取字符拼出答案。 */
const captchaCodeFromSvg = (svg: string): string => {
  const characters = [
    ...svg.matchAll(/<text[^>]*>(?<char>[^<]+)<\/text>/gu),
  ].map((match) => match.groups?.char ?? "");

  return characters.join("");
};

const openLoginPage = async (page: Page): Promise<string> => {
  // 验证码一次性：在请求发出前挂路由，读响应体后原样放行，避免响应被页面导航释放。
  let captchaSvg = "";

  await page.route("**/api/captcha", async (route) => {
    const response = await route.fetch();
    const payload: unknown = await response.json();

    if (isCaptchaPayload(payload)) {
      captchaSvg = payload.svg;
    }

    await route.fulfill({ response });
  });

  await page.goto("/login", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
  await expect.poll(() => captchaCodeFromSvg(captchaSvg)).toHaveLength(4);

  return captchaCodeFromSvg(captchaSvg);
};

const fillCredentials = async (page: Page, captcha: string) => {
  // 标签文本带必填星号，按输入框角色（无障碍名称不含装饰性星号）定位。
  await page.getByRole("textbox", { name: "登录名" }).fill(ADMIN_USERNAME);
  await page.getByRole("textbox", { name: "密码" }).fill(password);
  await page.getByRole("textbox", { name: "图形验证码" }).fill(captcha);
};

test("验证码错误时在表单内提示，且不离开登录页", async ({ page }) => {
  await openLoginPage(page);
  await fillCredentials(page, WRONG_CAPTCHA);
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page.getByRole("alert")).toContainText("验证码错误或已过期");
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/u);
});

test("超级管理员登录进入工作台，并能退出登录", async ({ page }) => {
  const captcha = await openLoginPage(page);
  await fillCredentials(page, captcha);
  await page.getByRole("button", { name: "登录" }).click();

  // 登录成功回到站内目标页（默认工作台），会话 Cookie 生效。
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();

  // 桌面端退出入口在左侧边栏用户菜单。
  await page.locator("aside").getByRole("button", { name: "用户菜单" }).click();
  await page.getByRole("menuitem", { name: "退出登录" }).click();

  await expect(page).toHaveURL(/\/login(?:\?.*)?$/u);
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
});
