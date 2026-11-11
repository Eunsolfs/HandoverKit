import { describe, expect, it } from "vite-plus/test";

import {
  createClient,
  createTestUser,
  db,
  ensureAcceptedRecord,
} from "../support/api.ts";
import {
  captureOrpcError,
  createItemFixture,
  createMatterFixture,
  createTeamFixture,
} from "../support/fixtures.ts";

const setupTeam = async () => {
  const team = createTeamFixture(db);

  const teamAdmin = await createTestUser({
    role: "team_admin",
    teamId: team.id,
  });

  const member = await createTestUser({ role: "member", teamId: team.id });

  return { member, team, teamAdmin };
};

const seedWeek = async () => {
  const { member, team, teamAdmin } = await setupTeam();
  const matter = createMatterFixture(db, team.id, { name: "统计事项" });

  const gauze = createItemFixture(db, matter.id, {
    minStock: 10,
    name: "纱布",
    stock: 100,
    unit: "包",
  });

  const needle = createItemFixture(db, matter.id, {
    minStock: 5,
    name: "针头",
    stock: 10,
    unit: "支",
  });

  const tape = createItemFixture(db, matter.id, {
    minStock: 5,
    name: "胶布",
    stock: 5,
    unit: "卷",
  });

  const patient = {
    matterId: matter.id,
    patientName: "统计患者",
    patientNo: "S001",
    patientType: "outpatient" as const,
  };

  await Promise.all(
    ["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07", "2026-05-10"].map(
      async (date) => {
        await ensureAcceptedRecord(member.client, matter.id, date);
      }
    )
  );

  await member.client.usage.create({
    ...patient,
    items: [{ itemId: gauze.id, quantity: 3 }],
    usedAt: "2026-05-04",
  });
  await member.client.usage.create({
    ...patient,
    items: [
      { itemId: gauze.id, quantity: 2 },
      { itemId: tape.id, quantity: 1 },
    ],
    patientType: "inpatient",
    usedAt: "2026-05-05",
  });
  await member.client.usage.create({
    ...patient,
    items: [{ itemId: needle.id, quantity: 2 }],
    usedAt: "2026-05-06",
  });

  const revokedUsage = await member.client.usage.create({
    ...patient,
    items: [{ itemId: gauze.id, quantity: 1 }],
    usedAt: "2026-05-10",
  });

  const pendingUsage = await member.client.usage.create({
    ...patient,
    items: [{ itemId: tape.id, quantity: 1 }],
    usedAt: "2026-05-07",
  });

  const revokedRequest = await member.client.usage.requestRevoke({
    id: revokedUsage.id,
    reason: "撤销统计用例",
  });

  await teamAdmin.client.usage.reviewRevoke({
    approve: true,
    requestId: revokedRequest.id,
  });
  await member.client.usage.requestRevoke({
    id: pendingUsage.id,
    reason: "待审批统计用例",
  });

  await member.client.exceptions.create({
    description: "统计未解决异常",
    matterId: matter.id,
    type: "damaged",
  });

  const resolvedException = await member.client.exceptions.create({
    description: "统计已解决异常",
    matterId: matter.id,
    type: "other",
  });

  await teamAdmin.client.exceptions.resolve({
    id: resolvedException.id,
    resolution: "已处理",
  });

  return { gauze, matter, member, needle, tape, team, teamAdmin };
};

describe("stats", () => {
  it("统计权限：成员禁止，团队管理员按团队隔离", async () => {
    const { member, team, teamAdmin } = await setupTeam();
    const matter = createMatterFixture(db, team.id);

    const memberBlocked = await captureOrpcError(
      member.client.stats.overview({ period: "week" })
    );

    expect(memberBlocked.code).toBe("FORBIDDEN");

    const otherTeam = createTeamFixture(db);

    const otherAdmin = await createTestUser({
      role: "team_admin",
      teamId: otherTeam.id,
    });

    const crossTeam = await captureOrpcError(
      otherAdmin.client.stats.overview({
        matterId: matter.id,
        period: "week",
      })
    );

    expect(crossTeam.code).toBe("NOT_FOUND");

    const anonymous = await captureOrpcError(
      createClient().stats.overview({ period: "week" })
    );

    expect(anonymous.code).toBe("UNAUTHORIZED");

    const superAdmin = await createTestUser({ role: "super_admin" });

    const overview = await superAdmin.client.stats.overview({
      period: "week",
      teamId: team.id,
    });

    expect(overview.totals.quantity).toBe(0);
    expect(teamAdmin.id).toBeDefined();
  });

  it("自然周统计总量与按日补齐：排除已撤销、包含待审批撤销", async () => {
    const { teamAdmin } = await seedWeek();

    const overview = await teamAdmin.client.stats.overview({
      anchorDate: "2026-05-06",
      period: "week",
    });

    expect(overview.range).toStrictEqual({
      end: "2026-05-10",
      period: "week",
      start: "2026-05-04",
    });
    expect(overview.totals).toStrictEqual({
      acceptedCount: 5,
      itemKinds: 3,
      quantity: 9,
      recordCount: 5,
      usageCount: 4,
    });
    expect(
      overview.byDay.map((row) => [row.date, row.quantity, row.usageCount])
    ).toStrictEqual([
      ["2026-05-04", 3, 1],
      ["2026-05-05", 3, 1],
      ["2026-05-06", 2, 1],
      ["2026-05-07", 1, 1],
      ["2026-05-08", 0, 0],
      ["2026-05-09", 0, 0],
      ["2026-05-10", 0, 0],
    ]);
  });

  it("按物品排行占比与患者类型、告警统计", async () => {
    const { gauze, needle, tape, teamAdmin } = await seedWeek();

    const overview = await teamAdmin.client.stats.overview({
      anchorDate: "2026-05-06",
      period: "week",
    });

    const byItem = new Map(overview.byItem.map((row) => [row.itemName, row]));
    expect({
      gauze: byItem.get(gauze.name),
      needle: byItem.get(needle.name),
      tape: byItem.get(tape.name),
    }).toMatchObject({
      gauze: { quantity: 5, share: 0.5556, usageCount: 2 },
      needle: { quantity: 2, share: 0.2222, usageCount: 1 },
      tape: { quantity: 2, share: 0.2222, usageCount: 2 },
    });

    expect(overview.byPatientType).toStrictEqual({
      inpatient: 3,
      outpatient: 6,
    });
    expect(overview.alerts).toMatchObject({
      openExceptions: 1,
      pendingRevocations: 1,
    });
    expect(
      overview.alerts.lowStockItems.map((row) => [
        row.itemId,
        row.stock,
        row.minStock,
      ])
    ).toStrictEqual([[tape.id, 3, 5]]);
  });

  it("自然月/自然年区间长度正确，支持按事项筛选", async () => {
    const { member, team, teamAdmin } = await setupTeam();
    const matter = createMatterFixture(db, team.id);
    const gauze = createItemFixture(db, matter.id, { stock: 50 });

    const patient = {
      matterId: matter.id,
      patientName: "区间患者",
      patientNo: "S002",
      patientType: "outpatient" as const,
    };

    await ensureAcceptedRecord(member.client, matter.id, "2026-05-06");
    await ensureAcceptedRecord(member.client, matter.id, "2026-05-07");

    await member.client.usage.create({
      ...patient,
      items: [{ itemId: gauze.id, quantity: 4 }],
      usedAt: "2026-05-06",
    });
    await member.client.usage.create({
      ...patient,
      items: [{ itemId: gauze.id, quantity: 2 }],
      usedAt: "2026-05-07",
    });

    const month = await teamAdmin.client.stats.overview({
      anchorDate: "2026-05-15",
      period: "month",
    });

    expect(month.range).toStrictEqual({
      end: "2026-05-31",
      period: "month",
      start: "2026-05-01",
    });
    expect({
      days: month.byDay.length,
      quantity: month.totals.quantity,
    }).toStrictEqual({ days: 31, quantity: 6 });

    const year = await teamAdmin.client.stats.overview({
      anchorDate: "2026-05-15",
      period: "year",
    });

    expect({ days: year.byDay.length, end: year.range.end }).toStrictEqual({
      days: 365,
      end: "2026-12-31",
    });

    const scoped = await teamAdmin.client.stats.overview({
      anchorDate: "2026-05-15",
      matterId: matter.id,
      period: "month",
    });

    expect({
      itemKinds: scoped.totals.itemKinds,
      quantity: scoped.totals.quantity,
    }).toStrictEqual({ itemKinds: 1, quantity: 6 });

    const otherMatter = createMatterFixture(db, matter.teamId);
    createItemFixture(db, otherMatter.id, { stock: 20 });

    const empty = await teamAdmin.client.stats.overview({
      anchorDate: "2026-05-15",
      matterId: otherMatter.id,
      period: "month",
    });

    expect({
      byDayZero: empty.byDay.every((row) => row.quantity === 0),
      byItem: empty.byItem,
      quantity: empty.totals.quantity,
    }).toStrictEqual({ byDayZero: true, byItem: [], quantity: 0 });
  });

  it("同一物品档案跨子仓库合并，并保留子仓库拆分", async () => {
    const { team, teamAdmin } = await setupTeam();
    const matter = createMatterFixture(db, team.id);
    const member = await createTestUser({ role: "member", teamId: team.id });

    const mainItem = createItemFixture(db, matter.id, {
      name: "血糖试纸",
      spec: "50 片",
      stock: 20,
      unit: "盒",
    });

    const second = await teamAdmin.client.subWarehouses.create({
      matterId: matter.id,
      name: "住院仓库",
    });

    const secondItem = await teamAdmin.client.items.create({
      name: "血糖试纸",
      spec: "50 片",
      stock: 20,
      subWarehouseId: second.id,
      unit: "盒",
    });

    await ensureAcceptedRecord(member.client, matter.id, "2026-05-06");

    await member.client.usage.create({
      allowCrossWarehouse: true,
      items: [
        { itemId: mainItem.id, quantity: 2 },
        { itemId: secondItem.id, quantity: 3 },
      ],
      matterId: matter.id,
      patientName: "合并统计患者",
      patientNo: "S100",
      patientType: "outpatient",
      usedAt: "2026-05-06",
    });

    const overview = await teamAdmin.client.stats.overview({
      anchorDate: "2026-05-06",
      period: "week",
    });

    const row = overview.byItem.find((item) => item.itemName === "血糖试纸");

    expect({
      itemKinds: overview.totals.itemKinds,
      quantity: row?.quantity,
      breakdownCount: row?.subWarehouseBreakdown.length,
      breakdownQuantity: row?.subWarehouseBreakdown.reduce(
        (sum, entry) => sum + entry.quantity,
        0
      ),
      breakdownNames: row?.subWarehouseBreakdown
        .map((entry) => entry.subWarehouseName)
        .toSorted(),
    }).toStrictEqual({
      itemKinds: 1,
      quantity: 5,
      breakdownCount: 2,
      breakdownQuantity: 5,
      breakdownNames: ["主仓库", "住院仓库"].toSorted(),
    });
  });
});
