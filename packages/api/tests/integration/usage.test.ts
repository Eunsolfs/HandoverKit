import { describe, expect, it } from "vite-plus/test";

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

  const gauze = createItemFixture(db, matter.id, {
    name: "纱布",
    stock: 10,
    unit: "包",
  });

  const needle = createItemFixture(db, matter.id, {
    name: "针头",
    stock: 5,
    unit: "支",
  });

  const listItems = async () => {
    const rows = await member.client.items.list({ matterId: matter.id });

    return rows;
  };

  return { gauze, listItems, matter, member, needle, team, teamAdmin };
};

describe("usage", () => {
  it("未登录不能访问用物消耗", async () => {
    const calls = [
      createClient().usage.list({}),
      createClient().usage.create({
        items: [{ itemId: "x", quantity: 1 }],
        matterId: "x",
        patientName: "匿名",
        patientNo: "P0",
        patientType: "outpatient",
        usedAt: "2026-03-01",
      }),
    ];

    const codes = await Promise.all(
      calls.map(async (call) => {
        const captured = await captureOrpcError(call);

        return captured.code;
      })
    );

    expect(codes).toStrictEqual(["UNAUTHORIZED", "UNAUTHORIZED"]);
  });

  it("登记消耗原子扣减库存并写消耗流水", async () => {
    const { gauze, listItems, matter, member, needle } = await setup();

    const created = await member.client.usage.create({
      items: [
        { itemId: gauze.id, quantity: 3 },
        { itemId: needle.id, quantity: 2 },
      ],
      matterId: matter.id,
      note: "换药",
      patientName: "王五",
      patientNo: "P100",
      patientPhone: "13800000000",
      patientType: "outpatient",
      usedAt: "2026-03-01",
    });

    expect(created).toMatchObject({
      matterId: matter.id,
      matterName: matter.name,
      operatorName: member.session?.user.name ?? "",
      patientName: "王五",
      patientPhone: "13800000000",
      patientType: "outpatient",
      status: "active",
      totalQuantity: 5,
      usedAt: "2026-03-01",
    });

    const items = await listItems();

    const stockByItem = new Map(
      items.map((item) => [item.id, item.stock] as const)
    );

    expect({
      gauze: stockByItem.get(gauze.id),
      needle: stockByItem.get(needle.id),
    }).toStrictEqual({ gauze: 7, needle: 3 });

    const movements = await member.client.items.movements({
      itemId: gauze.id,
    });

    expect(movements[0]).toMatchObject({
      quantityDelta: -3,
      refId: created.id,
      refType: "usage",
      stockAfter: 7,
      type: "consumption",
    });

    const listed = await member.client.usage.list({
      from: "2026-03-01",
      to: "2026-03-01",
    });

    expect(listed.total).toBe(1);
  });

  it("库存不足整单回滚，不产生半条消耗", async () => {
    const { gauze, listItems, matter, member, needle } = await setup();

    const failed = await captureOrpcError(
      member.client.usage.create({
        items: [
          { itemId: gauze.id, quantity: 2 },
          { itemId: needle.id, quantity: 99 },
        ],
        matterId: matter.id,
        patientName: "赵六",
        patientNo: "P101",
        patientType: "inpatient",
        usedAt: "2026-03-02",
      })
    );

    expect(failed.code).toBe("CONFLICT");

    const items = await listItems();
    expect(
      items.map((item) => item.stock).toSorted((left, right) => left - right)
    ).toStrictEqual([5, 10]);
    const allUsages = await member.client.usage.list({});
    expect(allUsages.total).toBe(0);
  });

  it("重复物品、停用物品与跨团队事项被拒绝", async () => {
    const { matter, member } = await setup();

    const archived = createItemFixture(db, matter.id, {
      name: "停用物品",
      status: "archived",
    });

    const duplicated = await captureOrpcError(
      member.client.usage.create({
        items: [
          { itemId: archived.id, quantity: 1 },
          { itemId: archived.id, quantity: 2 },
        ],
        matterId: matter.id,
        patientName: "钱七",
        patientNo: "P102",
        patientType: "outpatient",
        usedAt: "2026-03-03",
      })
    );

    const archivedBlocked = await captureOrpcError(
      member.client.usage.create({
        items: [{ itemId: archived.id, quantity: 1 }],
        matterId: matter.id,
        patientName: "钱七",
        patientNo: "P102",
        patientType: "outpatient",
        usedAt: "2026-03-03",
      })
    );

    expect([duplicated.code, archivedBlocked.code]).toStrictEqual([
      "BAD_REQUEST",
      "BAD_REQUEST",
    ]);

    const otherTeam = createTeamFixture(db);

    const otherAdmin = await createTestUser({
      role: "team_admin",
      teamId: otherTeam.id,
    });

    const crossTeam = await captureOrpcError(
      otherAdmin.client.usage.create({
        items: [{ itemId: archived.id, quantity: 1 }],
        matterId: matter.id,
        patientName: "孙八",
        patientNo: "P103",
        patientType: "outpatient",
        usedAt: "2026-03-03",
      })
    );

    expect(crossTeam.code).toBe("NOT_FOUND");
  });

  it("消耗自动关联当日交接记录并出现在记录详情", async () => {
    const { matter, member, teamAdmin } = await setup();

    const record = await member.client.records.today({
      date: "2026-03-04",
      matterId: matter.id,
    });

    const [firstItem] = record.items;

    if (firstItem === undefined) {
      throw new Error("缺少清单项");
    }

    const created = await member.client.usage.create({
      items: [{ itemId: firstItem.itemId, quantity: 1 }],
      matterId: matter.id,
      patientName: "周九",
      patientNo: "P104",
      patientType: "outpatient",
      usedAt: "2026-03-04",
    });

    expect(created.recordId).toBe(record.id);

    const detail = await teamAdmin.client.records.get({ id: record.id });
    expect({
      exceptions: detail.exceptions,
      usageCount: detail.usageCount,
      usages: detail.usages.map((row) => row.id),
    }).toStrictEqual({
      exceptions: [],
      usageCount: 1,
      usages: [created.id],
    });
  });

  it("撤销申请：同一记录只允许一条待审批申请", async () => {
    const { matter, member, teamAdmin } = await setup();

    const itemRows = await member.client.items.list({ matterId: matter.id });
    const [firstItem] = itemRows;

    if (firstItem === undefined) {
      throw new Error("缺少物品");
    }

    const created = await member.client.usage.create({
      items: [{ itemId: firstItem.id, quantity: 1 }],
      matterId: matter.id,
      patientName: "吴十",
      patientNo: "P105",
      patientType: "outpatient",
      usedAt: "2026-03-05",
    });

    const request = await member.client.usage.requestRevoke({
      id: created.id,
      reason: "登记错误",
    });

    expect(request).toMatchObject({
      reason: "登记错误",
      requestedByName: member.session?.user.name ?? "",
      status: "pending",
      usageId: created.id,
    });

    const afterRequest = await member.client.usage.get({ id: created.id });
    expect({
      revokeRequestId: afterRequest.revokeRequest?.id,
      status: afterRequest.status,
    }).toStrictEqual({ revokeRequestId: request.id, status: "revoke_pending" });

    const duplicate = await captureOrpcError(
      member.client.usage.requestRevoke({
        id: created.id,
        reason: "再次申请",
      })
    );

    expect(duplicate.code).toBe("CONFLICT");

    const memberPending = await captureOrpcError(
      member.client.usage.pendingRevokes({})
    );

    expect(memberPending.code).toBe("FORBIDDEN");

    const pending = await teamAdmin.client.usage.pendingRevokes({});
    expect(pending.map((row) => [row.id, row.usage.id] as const)).toStrictEqual(
      [[request.id, created.id]]
    );
  });

  it("管理员审批通过恢复库存并写恢复流水", async () => {
    const { gauze, listItems, matter, member, teamAdmin } = await setup();

    const created = await member.client.usage.create({
      items: [{ itemId: gauze.id, quantity: 4 }],
      matterId: matter.id,
      patientName: "郑十一",
      patientNo: "P106",
      patientType: "inpatient",
      usedAt: "2026-03-06",
    });

    const request = await member.client.usage.requestRevoke({
      id: created.id,
      reason: "患者取消",
    });

    const approved = await teamAdmin.client.usage.reviewRevoke({
      approve: true,
      note: "同意",
      requestId: request.id,
    });

    expect(approved).toMatchObject({
      status: "revoked",
    });
    expect(approved.revokeRequest).toMatchObject({
      reviewNote: "同意",
      reviewedByName: teamAdmin.session?.user.name ?? "",
      status: "approved",
    });

    const items = await listItems();
    expect(items.find((item) => item.id === gauze.id)?.stock).toBe(10);

    const movements = await teamAdmin.client.items.movements({
      itemId: gauze.id,
    });

    expect(movements[0]).toMatchObject({
      quantityDelta: 4,
      stockAfter: 10,
      type: "revoke",
    });

    const reviewed = await captureOrpcError(
      teamAdmin.client.usage.reviewRevoke({
        approve: true,
        requestId: request.id,
      })
    );

    const requestAgain = await captureOrpcError(
      member.client.usage.requestRevoke({
        id: created.id,
        reason: "已撤销",
      })
    );

    expect([reviewed.code, requestAgain.code]).toStrictEqual([
      "CONFLICT",
      "CONFLICT",
    ]);
  });

  it("驳回撤销申请后记录恢复 active 且库存不变", async () => {
    const { gauze, listItems, matter, member, teamAdmin } = await setup();

    const created = await member.client.usage.create({
      items: [{ itemId: gauze.id, quantity: 2 }],
      matterId: matter.id,
      patientName: "冯十二",
      patientNo: "P107",
      patientType: "outpatient",
      usedAt: "2026-03-07",
    });

    const request = await member.client.usage.requestRevoke({
      id: created.id,
      reason: "想撤销",
    });

    const rejected = await teamAdmin.client.usage.reviewRevoke({
      approve: false,
      requestId: request.id,
    });

    expect({
      requestStatus: rejected.revokeRequest?.status,
      status: rejected.status,
    }).toStrictEqual({ requestStatus: "rejected", status: "active" });

    const items = await listItems();
    expect(items.find((item) => item.id === gauze.id)?.stock).toBe(8);

    const again = await member.client.usage.requestRevoke({
      id: created.id,
      reason: "重新申请",
    });

    expect(again.status).toBe("pending");
  });

  it("列表支持状态、日期范围、分页与跨团队隔离", async () => {
    const { matter, member, teamAdmin } = await setup();

    const itemRows = await member.client.items.list({ matterId: matter.id });
    const [firstItem] = itemRows;

    if (firstItem === undefined) {
      throw new Error("缺少物品");
    }

    const usageA = await member.client.usage.create({
      items: [{ itemId: firstItem.id, quantity: 1 }],
      matterId: matter.id,
      patientName: "甲",
      patientNo: "P201",
      patientType: "outpatient",
      usedAt: "2026-04-01",
    });

    await member.client.usage.create({
      items: [{ itemId: firstItem.id, quantity: 1 }],
      matterId: matter.id,
      patientName: "乙",
      patientNo: "P202",
      patientType: "outpatient",
      usedAt: "2026-04-02",
    });

    const usageC = await member.client.usage.create({
      items: [{ itemId: firstItem.id, quantity: 1 }],
      matterId: matter.id,
      patientName: "丙",
      patientNo: "P203",
      patientType: "outpatient",
      usedAt: "2026-04-03",
    });

    await member.client.usage.requestRevoke({
      id: usageC.id,
      reason: "状态筛选",
    });

    const pending = await teamAdmin.client.usage.list({
      status: "revoke_pending",
    });

    expect(pending.items.map((row) => row.id)).toStrictEqual([usageC.id]);

    const ranged = await member.client.usage.list({
      from: "2026-04-01",
      to: "2026-04-02",
    });

    expect(ranged.total).toBe(2);

    const paged = await member.client.usage.list({ page: 1, pageSize: 2 });
    expect({ count: paged.items.length, total: paged.total }).toStrictEqual({
      count: 2,
      total: 3,
    });

    const otherTeam = createTeamFixture(db);

    const otherAdmin = await createTestUser({
      role: "team_admin",
      teamId: otherTeam.id,
    });

    const crossGet = await captureOrpcError(
      otherAdmin.client.usage.get({ id: usageA.id })
    );

    const crossList = await captureOrpcError(
      otherAdmin.client.usage.list({ matterId: matter.id })
    );

    expect([crossGet.code, crossList.code]).toStrictEqual([
      "NOT_FOUND",
      "NOT_FOUND",
    ]);
    await expect(
      otherAdmin.client.usage.pendingRevokes({})
    ).resolves.toHaveLength(0);
  });
});
