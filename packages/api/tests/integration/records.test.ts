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
    stock: 8,
    unit: "包",
  });

  const needle = createItemFixture(db, matter.id, {
    name: "针头",
    stock: 3,
    unit: "支",
  });

  return { gauze, matter, member, needle, team, teamAdmin };
};

const checkedItems = (
  record: {
    items: { itemId: string; expectedQty: number }[];
  },
  actual: Record<string, number> = {}
) =>
  record.items.map((item) => ({
    actualQty: actual[item.itemId] ?? item.expectedQty,
    checked: true,
    itemId: item.itemId,
  }));

describe("records", () => {
  it("未登录不能访问交接记录", async () => {
    const error = await captureOrpcError(
      createClient().records.today({ matterId: "x" })
    );

    expect(error.code).toBe("UNAUTHORIZED");
  });

  it("当日记录幂等生成，清单取当前库存快照", async () => {
    const { gauze, matter, member, needle, teamAdmin } = await setup();

    const first = await member.client.records.today({
      date: "2026-01-05",
      matterId: matter.id,
    });

    expect(first).toMatchObject({
      matterId: matter.id,
      matterName: matter.name,
      recordDate: "2026-01-05",
      status: "pending_acceptance",
      usageCount: 0,
    });
    expect(first.permissions).toStrictEqual({
      canAccept: true,
      canDelete: false,
      canHandover: false,
      canRegisterUsage: false,
      requiresExceptionReport: false,
    });
    expect(first.items.map((item) => item.itemId).toSorted()).toStrictEqual(
      [gauze.id, needle.id].toSorted()
    );

    const second = await member.client.records.today({
      date: "2026-01-05",
      matterId: matter.id,
    });

    const admin = await createTestUser({
      role: "team_admin",
      teamId: matter.teamId,
    });

    await admin.client.items.inbound({ id: gauze.id, quantity: 2 });

    const third = await member.client.records.today({
      date: "2026-01-05",
      matterId: matter.id,
    });

    expect({
      expectedQty: third.items.find((item) => item.itemId === gauze.id)
        ?.expectedQty,
      secondId: second.id,
    }).toStrictEqual({ expectedQty: 8, secondId: first.id });
    expect(teamAdmin.id).toBeDefined();
  });

  it("验收必须覆盖全部清单项并勾选，且记录状态机只允许一次验收", async () => {
    const { matter, member, needle } = await setup();

    const record = await member.client.records.today({
      date: "2026-01-06",
      matterId: matter.id,
    });

    const items = checkedItems(record);

    const missing = await captureOrpcError(
      member.client.records.accept({ id: record.id, items: items.slice(0, 1) })
    );

    const unchecked = await captureOrpcError(
      member.client.records.accept({
        id: record.id,
        items: items.map((item) =>
          item.itemId === needle.id ? { ...item, checked: false } : item
        ),
      })
    );

    expect([missing.code, unchecked.code]).toStrictEqual([
      "BAD_REQUEST",
      "BAD_REQUEST",
    ]);

    const accepted = await member.client.records.accept({
      id: record.id,
      items,
      note: "核对无误",
    });

    expect(accepted).toMatchObject({
      acceptanceNote: "核对无误",
      acceptedByName: member.session?.user.name ?? "",
      status: "accepted",
    });
    expect(accepted.permissions).toStrictEqual({
      canAccept: false,
      canDelete: false,
      canHandover: true,
      canRegisterUsage: true,
      requiresExceptionReport: false,
    });

    const reloaded = await member.client.records.today({
      date: "2026-01-06",
      matterId: matter.id,
    });

    expect(reloaded.id).toBe(record.id);

    const secondAccept = await captureOrpcError(
      member.client.records.accept({ id: record.id, items })
    );

    expect(secondAccept.code).toBe("CONFLICT");
  });

  it("实盘数量不一致必须填备注，且异常上报前禁止登记用物", async () => {
    const { gauze, matter, member } = await setup();

    const record = await member.client.records.today({
      date: "2026-01-07",
      matterId: matter.id,
    });

    const items = checkedItems(record);

    const missingNote = await captureOrpcError(
      member.client.records.accept({
        id: record.id,
        items: items.map((item) =>
          item.itemId === gauze.id ? { ...item, actualQty: 6 } : item
        ),
      })
    );

    expect(missingNote.code).toBe("BAD_REQUEST");

    const accepted = await member.client.records.accept({
      id: record.id,
      items: items.map((item) =>
        item.itemId === gauze.id
          ? { ...item, actualQty: 6, note: "少 2 包" }
          : item
      ),
    });

    expect({
      canRegisterUsage: accepted.permissions.canRegisterUsage,
      diffCount: accepted.diffCount,
      exceptions: accepted.exceptions,
      requiresExceptionReport: accepted.permissions.requiresExceptionReport,
    }).toStrictEqual({
      canRegisterUsage: false,
      diffCount: 1,
      exceptions: [],
      requiresExceptionReport: true,
    });

    const usageAttempt = await captureOrpcError(
      member.client.usage.create({
        items: [{ itemId: gauze.id, quantity: 1 }],
        matterId: matter.id,
        patientName: "差异患者",
        patientNo: "D001",
        patientType: "outpatient",
        usedAt: "2026-01-07",
      })
    );

    expect({
      code: usageAttempt.code,
      hasHint: usageAttempt.message.includes("异常上报"),
    }).toStrictEqual({ code: "CONFLICT", hasHint: true });
  });

  it("提交异常上报后允许登记用物", async () => {
    const { gauze, matter, member, teamAdmin } = await setup();

    const record = await member.client.records.today({
      date: "2026-01-07",
      matterId: matter.id,
    });

    const items = checkedItems(record);

    await member.client.records.accept({
      id: record.id,
      items: items.map((item) =>
        item.itemId === gauze.id
          ? { ...item, actualQty: 6, note: "少 2 包" }
          : item
      ),
    });

    const reported = await member.client.exceptions.create({
      description: "接班核对发现纱布少 2 包",
      itemId: gauze.id,
      matterId: matter.id,
      recordId: record.id,
      type: "count_mismatch",
    });

    const detail = await member.client.records.get({ id: record.id });

    expect(detail.exceptions.map((row) => row.id)).toContain(reported.id);
    expect(detail.permissions).toMatchObject({
      canRegisterUsage: true,
      requiresExceptionReport: false,
    });

    const usage = await member.client.usage.create({
      items: [{ itemId: gauze.id, quantity: 1 }],
      matterId: matter.id,
      patientName: "差异患者",
      patientNo: "D001",
      patientType: "outpatient",
      usedAt: "2026-01-07",
    });

    expect(usage.recordId).toBe(record.id);

    const summaries = await teamAdmin.client.records.list({
      matterId: matter.id,
    });

    expect(summaries.items[0]?.diffCount).toBe(1);
  });

  it("交班提交必须在验收之后", async () => {
    const { matter, member } = await setup();

    const record = await member.client.records.today({
      date: "2026-01-08",
      matterId: matter.id,
    });

    const items = checkedItems(record);

    const beforeAccept = await captureOrpcError(
      member.client.records.submitHandover({ id: record.id, items })
    );

    expect(beforeAccept.code).toBe("CONFLICT");

    await member.client.records.accept({ id: record.id, items });

    const submitted = await member.client.records.submitHandover({
      id: record.id,
      items,
      note: "已交接",
    });

    expect(submitted).toMatchObject({
      handoverByName: member.session?.user.name ?? "",
      handoverNote: "已交接",
      status: "handover_submitted",
    });

    const resubmit = await captureOrpcError(
      member.client.records.submitHandover({ id: record.id, items })
    );

    expect(resubmit.code).toBe("CONFLICT");
  });

  it("有消耗记录的交接记录不能删除", async () => {
    const { matter, member, teamAdmin } = await setup();

    const record = await member.client.records.today({
      date: "2026-01-09",
      matterId: matter.id,
    });

    const items = checkedItems(record);
    const [firstItem] = items;

    if (firstItem === undefined) {
      throw new Error("缺少清单项");
    }

    const memberRemove = await captureOrpcError(
      member.client.records.remove({ id: record.id })
    );

    expect(memberRemove.code).toBe("FORBIDDEN");

    await member.client.records.accept({ id: record.id, items });

    await member.client.usage.create({
      items: [{ itemId: firstItem.itemId, quantity: 1 }],
      matterId: matter.id,
      patientName: "李四",
      patientNo: "P002",
      patientType: "inpatient",
      usedAt: "2026-01-09",
    });

    const adminRemove = await captureOrpcError(
      teamAdmin.client.records.remove({ id: record.id })
    );

    expect(adminRemove.code).toBe("CONFLICT");

    const empty = await member.client.records.today({
      date: "2026-01-10",
      matterId: matter.id,
    });

    await teamAdmin.client.records.remove({ id: empty.id });

    const removed = await captureOrpcError(
      teamAdmin.client.records.get({ id: empty.id })
    );

    expect(removed.code).toBe("NOT_FOUND");
  });

  it("列表支持日期区间、状态与分页，且按团队隔离", async () => {
    const { matter, member, teamAdmin } = await setup();

    const day1 = await member.client.records.today({
      date: "2026-02-01",
      matterId: matter.id,
    });

    const day2 = await member.client.records.today({
      date: "2026-02-02",
      matterId: matter.id,
    });

    await member.client.records.accept({
      id: day1.id,
      items: checkedItems(day1),
    });

    const listed = await teamAdmin.client.records.list({
      matterId: matter.id,
      period: "month",
      anchorDate: "2026-02-15",
    });

    expect({
      dates: listed.items.map((row) => row.recordDate),
      total: listed.total,
    }).toStrictEqual({ dates: ["2026-02-02", "2026-02-01"], total: 2 });

    const dayPage = await teamAdmin.client.records.list({
      matterId: matter.id,
      period: "day",
      anchorDate: "2026-02-01",
    });

    expect(dayPage.items.map((row) => row.id)).toStrictEqual([day1.id]);

    const acceptedOnly = await teamAdmin.client.records.list({
      matterId: matter.id,
      status: "accepted",
    });

    expect(acceptedOnly.items.map((row) => row.id)).toStrictEqual([day1.id]);

    const paged = await teamAdmin.client.records.list({
      matterId: matter.id,
      page: 2,
      pageSize: 1,
    });

    expect({
      count: paged.items.length,
      distinctDays: day1.id !== day2.id,
      page: paged.page,
      pageSize: paged.pageSize,
    }).toStrictEqual({ count: 1, distinctDays: true, page: 2, pageSize: 1 });

    const otherTeam = createTeamFixture(db);

    const otherAdmin = await createTestUser({
      role: "team_admin",
      teamId: otherTeam.id,
    });

    const crossGet = await captureOrpcError(
      otherAdmin.client.records.get({ id: day1.id })
    );

    const crossList = await captureOrpcError(
      otherAdmin.client.records.list({ teamId: matter.teamId })
    );

    expect([crossGet.code, crossList.code]).toStrictEqual([
      "NOT_FOUND",
      "NOT_FOUND",
    ]);
  });

  it("接班有差异必须先异常上报才能交班", async () => {
    const { gauze, matter, member } = await setup();
    const date = "2026-06-01";

    const record = await member.client.records.today({
      date,
      matterId: matter.id,
    });

    const expected =
      record.items.find((row) => row.itemId === gauze.id)?.expectedQty ?? 0;

    const accepted = await member.client.records.accept({
      id: record.id,
      items: record.items.map((row) => ({
        actualQty: row.itemId === gauze.id ? expected - 1 : row.expectedQty,
        checked: true,
        itemId: row.itemId,
        note: row.itemId === gauze.id ? "少 1 包" : null,
      })),
    });

    expect({
      canHandover: accepted.permissions.canHandover,
      requiresExceptionReport: accepted.permissions.requiresExceptionReport,
    }).toStrictEqual({
      canHandover: false,
      requiresExceptionReport: true,
    });

    const blocked = await captureOrpcError(
      member.client.records.submitHandover({
        id: record.id,
        items: record.items.map((row) => ({
          actualQty: row.expectedQty,
          checked: true,
          itemId: row.itemId,
        })),
      })
    );

    expect({
      code: blocked.code,
      mentionsReport: blocked.message.includes("异常上报"),
    }).toStrictEqual({ code: "CONFLICT", mentionsReport: true });

    await member.client.exceptions.create({
      matterId: matter.id,
      recordId: record.id,
      itemId: gauze.id,
      type: "count_mismatch",
      severity: "medium",
      description: "接班纱布少 1 包",
    });

    const afterReport = await member.client.records.get({ id: record.id });
    expect(afterReport.permissions.canHandover).toBeTruthy();

    const submitted = await member.client.records.submitHandover({
      id: record.id,
      items: record.items.map((row) => ({
        actualQty: row.expectedQty,
        checked: true,
        itemId: row.itemId,
      })),
    });

    expect({
      canRegisterUsage: submitted.permissions.canRegisterUsage,
      status: submitted.status,
    }).toStrictEqual({
      canRegisterUsage: false,
      status: "handover_submitted",
    });
  });

  it("交班核对发现新差异也必须先异常上报", async () => {
    const { gauze, matter, member } = await setup();
    const date = "2026-06-05";

    const record = await member.client.records.today({
      date,
      matterId: matter.id,
    });

    await member.client.records.accept({
      id: record.id,
      items: checkedItems(record),
    });

    const handoverItems = record.items.map((item) => ({
      actualQty:
        item.itemId === gauze.id ? item.expectedQty - 1 : item.expectedQty,
      checked: true,
      itemId: item.itemId,
      note: item.itemId === gauze.id ? "交班少 1 包" : null,
    }));

    const blocked = await captureOrpcError(
      member.client.records.submitHandover({
        id: record.id,
        items: handoverItems,
      })
    );

    expect(blocked.code).toBe("CONFLICT");

    await member.client.exceptions.create({
      matterId: matter.id,
      recordId: record.id,
      itemId: gauze.id,
      type: "count_mismatch",
      severity: "medium",
      description: "交班核对纱布少 1 包",
    });

    const submitted = await member.client.records.submitHandover({
      id: record.id,
      items: handoverItems,
    });

    expect(submitted.status).toBe("handover_submitted");
  });
});
