import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";

import { login } from "../support/api.ts";
import { e2eBaseURL } from "../support/server.ts";

const uniqueSuffix = () => randomUUID().slice(0, 8).toUpperCase();

/** 把 API 登录得到的会话 Cookie 注入浏览器上下文，扫码页即处于已登录态。 */
const addSessionCookie = async (context: BrowserContext, cookie: string) => {
  const cookies = cookie.split("; ").map((pair) => {
    const separator = pair.indexOf("=");

    return {
      name: pair.slice(0, separator),
      url: e2eBaseURL,
      value: pair.slice(separator + 1),
    };
  });

  await context.addCookies(cookies);
};

const checkItem = async (page: Page, itemName: string) => {
  const checkbox = page.getByRole("checkbox", {
    name: `已核对 ${itemName}`,
  });

  await checkbox.click();
  await expect(checkbox).toBeChecked();
};

test("扫码页完成接班核对、用物登记与交班表全链路", async ({
  context,
  page,
}) => {
  const tag = uniqueSuffix();
  const { client, cookie } = await login();

  // 用真实接口（超级管理员会话）创建独立的团队/事项/物品，保证测试自洽。
  const team = await client.teams.create({
    code: `E2E${tag}`,
    name: `E2E 科室 ${tag}`,
  });

  const matter = await client.matters.create({
    name: `E2E 交接事项 ${tag}`,
    teamId: team.id,
  });

  const gloves = await client.items.create({
    matterId: matter.id,
    minStock: 10,
    name: "一次性无菌手套",
    spec: "M 号",
    stock: 50,
    unit: "副",
  });

  await client.items.create({
    matterId: matter.id,
    minStock: 5,
    name: "碘伏消毒液",
    spec: "100ml",
    stock: 20,
    unit: "瓶",
  });

  await addSessionCookie(context, cookie);
  await page.goto(`/scan/${matter.qrToken}`, {
    waitUntil: "networkidle",
  });

  // 页头：事项、团队、当日状态与物品数
  await expect(page.getByRole("heading", { name: matter.name })).toBeVisible();
  await expect(page.getByText(team.name)).toBeVisible();
  await expect(page.getByText("待接收")).toBeVisible();
  await expect(page.getByText("2 种物品")).toBeVisible();

  // 一、接班核对：逐项勾选后确认接收
  await checkItem(page, "一次性无菌手套");
  await checkItem(page, "碘伏消毒液");
  await page.getByRole("button", { name: "确认接收" }).click();
  await expect(page.getByText("已完成接班核对", { exact: true })).toBeVisible();
  await expect(page.getByText("已接收")).toBeVisible();

  // 二、用物登记：从仓库选物品并扣减库存
  await page.getByRole("tab", { name: "用物登记" }).click();
  await page
    .locator('[data-slot="select-trigger"]')
    .filter({ hasText: "选择物品" })
    .click();
  await page.getByRole("option", { name: /一次性无菌手套/u }).click();
  await page.getByRole("spinbutton", { name: "数量" }).fill("2");
  await page.getByRole("textbox", { name: "患者姓名" }).fill("测试患者");
  await page.getByRole("textbox", { name: "登记号" }).fill(`E2E${tag}`);
  await page.getByRole("button", { name: "提交用物登记" }).click();
  await expect(
    page.getByText("用物登记成功，库存已扣减", { exact: true })
  ).toBeVisible();

  // 三、交班表：再次逐项核对后提交
  await page.getByRole("tab", { name: "交班表" }).click();
  await checkItem(page, "一次性无菌手套");
  await checkItem(page, "碘伏消毒液");
  await page.getByRole("button", { name: "提交交班表" }).click();
  await expect(page.getByText("交班表已提交", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("今日交班表已提交");
  await expect(page.getByText("已交班", { exact: true })).toBeVisible();

  // 四、交班后从扫码页直达补登记，并预选当前事项/子仓库
  await page.getByRole("tab", { name: "用物登记" }).click();
  const backfillLink = page.getByRole("link", { name: "去补登记" });
  await expect(backfillLink).toBeVisible();
  await backfillLink.click();
  await expect(page).toHaveURL(/\/usage\?.*mode=backfill/u);
  await expect(page.getByRole("dialog")).toContainText("用物补登记");
  await expect(page.getByRole("button", { name: "提交补登记" })).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(matter.name);
  await page.keyboard.press("Escape");

  // 独立数据核对：状态闭环、消耗记录落库、库存扣减
  const today = await client.records.today({ matterId: matter.id });
  expect(today.status).toBe("handover_submitted");
  expect(today.usages).toHaveLength(1);
  expect(today.usages[0]?.patientName).toBe("测试患者");

  const items = await client.items.list({ matterId: matter.id });
  const glovesAfter = items.find((item) => item.id === gloves.id);
  expect(glovesAfter?.stock).toBe(48);
});

test("接班确认前禁止登记用物；数量差异必须先异常上报", async ({
  context,
  page,
}) => {
  const tag = uniqueSuffix();
  const { client, cookie } = await login();

  const team = await client.teams.create({
    code: `E2E${tag}`,
    name: `E2E 差异科室 ${tag}`,
  });

  const matter = await client.matters.create({
    name: `E2E 差异事项 ${tag}`,
    teamId: team.id,
  });

  await client.items.create({
    matterId: matter.id,
    minStock: 5,
    name: "一次性无菌手套",
    spec: "M 号",
    stock: 50,
    unit: "副",
  });

  await client.items.create({
    matterId: matter.id,
    minStock: 5,
    name: "碘伏消毒液",
    spec: "100ml",
    stock: 20,
    unit: "瓶",
  });

  await addSessionCookie(context, cookie);
  await page.goto(`/scan/${matter.qrToken}`, {
    waitUntil: "networkidle",
  });

  // 未接班：用物登记页只显示提示，不出现登记表单
  await page.getByRole("tab", { name: "用物登记" }).click();
  await expect(page.getByText("请先完成接班核对")).toBeVisible();
  await expect(page.getByRole("button", { name: "提交用物登记" })).toHaveCount(
    0
  );

  // 接班核对：制造一项数量差异并填写备注
  await page.getByRole("tab", { name: "接班核对" }).click();
  await checkItem(page, "一次性无菌手套");
  await checkItem(page, "碘伏消毒液");
  await page
    .getByRole("spinbutton", { name: "一次性无菌手套 实盘数量" })
    .fill("48");
  await page
    .getByRole("textbox", { name: "一次性无菌手套 差异备注" })
    .fill("少 2 副");
  await page.getByRole("button", { name: "确认接收" }).click();

  // 自动跳到用物登记：差异未上报前只能看到异常上报表单
  await expect(page.getByText("发现 1 项数量差异")).toBeVisible();
  await expect(page.getByRole("button", { name: "提交用物登记" })).toHaveCount(
    0
  );
  await expect(
    page.getByRole("button", { name: "提交异常上报" })
  ).toBeVisible();

  // 提交异常上报后解锁用物登记
  await page.getByRole("button", { name: "提交异常上报" }).click();
  await expect(page.getByText("异常上报已提交", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "提交用物登记" })
  ).toBeVisible();

  const detail = await client.records.today({ matterId: matter.id });
  expect(detail.permissions.requiresExceptionReport).toBe(false);
  expect(detail.permissions.canRegisterUsage).toBe(true);
  expect(detail.exceptions).toHaveLength(1);
  expect(detail.exceptions[0]?.type).toBe("count_mismatch");
  expect(detail.diffCount).toBe(1);
});
