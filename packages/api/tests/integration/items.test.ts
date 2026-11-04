import { eq } from "drizzle-orm";
import Jimp from "jimp";
import { describe, expect, it } from "vite-plus/test";

import { itemImage } from "@handoverkit/db/schema/handover";

import { createClient, createTestUser, db } from "../support/api.ts";
import {
  captureOrpcError,
  createItemFixture,
  createMatterFixture,
  createTeamFixture,
} from "../support/fixtures.ts";

const setup = async () => {
  const team = createTeamFixture(db);

  const teamAdmin = await createTestUser({
    role: "team_admin",
    teamId: team.id,
  });

  const member = await createTestUser({ role: "member", teamId: team.id });
  const matter = createMatterFixture(db, team.id);

  return { matter, member, team, teamAdmin };
};

describe("items", () => {
  it("未登录不能访问物品", async () => {
    const error = await captureOrpcError(
      createClient().items.list({ matterId: "x" })
    );

    expect(error.code).toBe("UNAUTHORIZED");
  });

  it("新增物品写初始流水，低库存标记正确，重名冲突", async () => {
    const { matter, teamAdmin } = await setup();

    const created = await teamAdmin.client.items.create({
      location: "抢救车第一层",
      matterId: matter.id,
      minStock: 5,
      name: "留置针",
      spec: "24G",
      stock: 12,
      unit: "支",
    });

    expect(created).toMatchObject({
      lowStock: false,
      matterId: matter.id,
      minStock: 5,
      name: "留置针",
      spec: "24G",
      stock: 12,
      unit: "支",
    });

    const movements = await teamAdmin.client.items.movements({
      itemId: created.id,
    });

    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      operatorName: teamAdmin.session?.user.name,
      quantityDelta: 12,
      stockAfter: 12,
      type: "initial",
    });

    const low = await teamAdmin.client.items.create({
      matterId: matter.id,
      minStock: 5,
      name: "低库存物品",
      stock: 2,
      unit: "个",
    });

    expect(low.lowStock).toBeTruthy();

    const duplicate = await captureOrpcError(
      teamAdmin.client.items.create({
        matterId: matter.id,
        name: "留置针",
        unit: "支",
      })
    );

    expect(duplicate.code).toBe("CONFLICT");
  });

  it("入库与盘点写入对应流水", async () => {
    const { matter, teamAdmin } = await setup();

    const item = await teamAdmin.client.items.create({
      matterId: matter.id,
      name: "棉签",
      unit: "包",
    });

    const emptyMovements = await teamAdmin.client.items.movements({
      itemId: item.id,
    });

    expect(emptyMovements).toStrictEqual([]);

    const inbound = await teamAdmin.client.items.inbound({
      id: item.id,
      note: "周入库",
      quantity: 30,
    });

    expect(inbound.stock).toBe(30);

    const adjusted = await teamAdmin.client.items.adjust({
      id: item.id,
      note: "盘点差异",
      quantityDelta: -4,
    });

    expect(adjusted.stock).toBe(26);

    const movements = await teamAdmin.client.items.movements({
      itemId: item.id,
    });

    expect(movements.map((row) => row.type)).toStrictEqual([
      "adjustment",
      "inbound",
    ]);
    expect(movements[1]).toMatchObject({
      quantityDelta: 30,
      stockAfter: 30,
    });
  });

  it("盘点不能超扣为负，调整数量不能为 0", async () => {
    const { matter, teamAdmin } = await setup();

    const item = await teamAdmin.client.items.create({
      matterId: matter.id,
      name: "超扣物品",
      stock: 3,
      unit: "个",
    });

    const overdraw = await captureOrpcError(
      teamAdmin.client.items.adjust({
        id: item.id,
        note: "超扣",
        quantityDelta: -100,
      })
    );

    const zeroDelta = await captureOrpcError(
      teamAdmin.client.items.adjust({
        id: item.id,
        note: "零调整",
        quantityDelta: 0,
      })
    );

    expect([overdraw.code, zeroDelta.code]).toStrictEqual([
      "BAD_REQUEST",
      "BAD_REQUEST",
    ]);

    const listed = await teamAdmin.client.items.list({ matterId: matter.id });
    expect(listed[0]?.stock).toBe(3);
  });

  it("普通成员只读，跨团队访问返回 NOT_FOUND", async () => {
    const { matter, member, teamAdmin } = await setup();

    const item = await teamAdmin.client.items.create({
      matterId: matter.id,
      name: "检查手套",
      stock: 5,
      unit: "副",
    });

    const listed = await member.client.items.list({ matterId: matter.id });
    expect(listed.map((row) => row.id)).toStrictEqual([item.id]);

    const calls = [
      member.client.items.create({
        matterId: matter.id,
        name: "无权限",
        unit: "个",
      }),
      member.client.items.inbound({ id: item.id, quantity: 1 }),
      member.client.items.adjust({
        id: item.id,
        note: "x",
        quantityDelta: 1,
      }),
      member.client.items.remove({ id: item.id }),
    ];

    const codes = await Promise.all(
      calls.map(async (call) => {
        const captured = await captureOrpcError(call);

        return captured.code;
      })
    );

    expect(codes).toStrictEqual([
      "FORBIDDEN",
      "FORBIDDEN",
      "FORBIDDEN",
      "FORBIDDEN",
    ]);

    const otherTeam = createTeamFixture(db);

    const otherAdmin = await createTestUser({
      role: "team_admin",
      teamId: otherTeam.id,
    });

    const crossList = await captureOrpcError(
      otherAdmin.client.items.list({ matterId: matter.id })
    );

    const crossMovements = await captureOrpcError(
      otherAdmin.client.items.movements({ itemId: item.id })
    );

    expect([crossList.code, crossMovements.code]).toStrictEqual([
      "NOT_FOUND",
      "NOT_FOUND",
    ]);
  });

  it("有流水或交接快照的物品只能停用，不能删除", async () => {
    const { matter, member, teamAdmin } = await setup();

    const fresh = await teamAdmin.client.items.create({
      matterId: matter.id,
      name: "未使用物品",
      unit: "个",
    });

    await teamAdmin.client.items.remove({ id: fresh.id });

    const used = await teamAdmin.client.items.create({
      matterId: matter.id,
      name: "已入库物品",
      stock: 3,
      unit: "个",
    });

    const blocked = await captureOrpcError(
      teamAdmin.client.items.remove({ id: used.id })
    );

    expect(blocked.code).toBe("CONFLICT");

    const archived = await teamAdmin.client.items.update({
      id: used.id,
      status: "archived",
    });

    expect(archived.status).toBe("archived");

    const activeList = await teamAdmin.client.items.list({
      matterId: matter.id,
    });

    expect(activeList.map((row) => row.id)).not.toContain(used.id);

    const snapshotItem = createItemFixture(db, matter.id, {
      name: "快照物品",
      stock: 4,
    });

    await member.client.records.today({ matterId: matter.id });

    const snapshotBlocked = await captureOrpcError(
      teamAdmin.client.items.remove({ id: snapshotItem.id })
    );

    expect(snapshotBlocked.code).toBe("CONFLICT");
  });

  it("编辑物品不会直接修改库存", async () => {
    const { matter, teamAdmin } = await setup();

    const item = await teamAdmin.client.items.create({
      matterId: matter.id,
      minStock: 1,
      name: "旧名称",
      stock: 9,
      unit: "个",
    });

    const updated = await teamAdmin.client.items.update({
      id: item.id,
      minStock: 2,
      name: "新名称",
      spec: "M",
    });

    expect(updated).toMatchObject({
      minStock: 2,
      name: "新名称",
      spec: "M",
      stock: 9,
    });
  });

  it("产品图上传后压缩为缩略图，支持读取与删除", async () => {
    const { matter, teamAdmin } = await setup();

    const item = await teamAdmin.client.items.create({
      matterId: matter.id,
      name: "带图物品",
      stock: 1,
      unit: "个",
    });

    const source = new Jimp(800, 600, 0x22_aa_88_ff);
    const png = await source.getBufferAsync(Jimp.MIME_PNG);

    const uploaded = await teamAdmin.client.items.uploadImage({
      id: item.id,
      imageData: `data:image/png;base64,${png.toString("base64")}`,
    });

    expect(uploaded.imageUrl).toMatch(/^\/api\/items\/.+\/image\?v=\d+$/u);

    const listed = await teamAdmin.client.items.list({ matterId: matter.id });
    expect(listed.find((row) => row.id === item.id)?.imageUrl).toBe(
      uploaded.imageUrl
    );

    const removed = await teamAdmin.client.items.removeImage({ id: item.id });
    expect(removed.imageUrl).toBeNull();
  });

  it("彻底删除物品时同步清理产品图", async () => {
    const { matter, teamAdmin } = await setup();

    const item = await teamAdmin.client.items.create({
      matterId: matter.id,
      name: "待删除带图物品",
      stock: 0,
      unit: "个",
    });

    const source = new Jimp(100, 100, 0x22_aa_88_ff);
    const png = await source.getBufferAsync(Jimp.MIME_PNG);
    await teamAdmin.client.items.uploadImage({
      id: item.id,
      imageData: `data:image/png;base64,${png.toString("base64")}`,
    });

    const countImages = () =>
      db
        .select({ value: itemImage.itemId })
        .from(itemImage)
        .where(eq(itemImage.itemId, item.id))
        .all().length;

    expect(countImages()).toBe(1);

    await teamAdmin.client.items.remove({ id: item.id });

    expect(countImages()).toBe(0);
  });
});
