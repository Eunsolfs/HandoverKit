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
  const item = createItemFixture(db, matter.id, { name: "血压计" });

  return { item, matter, member, team, teamAdmin };
};

describe("exceptions", () => {
  it("未登录不能访问异常事件", async () => {
    const error = await captureOrpcError(createClient().exceptions.list({}));

    expect(error.code).toBe("UNAUTHORIZED");
  });

  it("成员可上报异常并按状态筛选", async () => {
    const { item, matter, member } = await setup();

    const created = await member.client.exceptions.create({
      description: "血压计袖带破损",
      itemId: item.id,
      matterId: matter.id,
      type: "damaged",
    });

    expect(created).toMatchObject({
      description: "血压计袖带破损",
      itemId: item.id,
      matterId: matter.id,
      matterName: matter.name,
      reportedByName: member.session?.user.name ?? "",
      severity: "medium",
      status: "open",
      type: "damaged",
    });

    const high = await member.client.exceptions.create({
      description: "血压计丢失",
      matterId: matter.id,
      severity: "high",
      type: "missing",
    });

    expect(high.severity).toBe("high");

    const open = await member.client.exceptions.list({
      matterId: matter.id,
      status: "open",
    });

    expect({
      ids: open.items.map((row) => row.id).toSorted(),
      total: open.total,
    }).toStrictEqual({
      ids: [created.id, high.id].toSorted(),
      total: 2,
    });
  });

  it("关联记录/物品必须属于同一交接事项", async () => {
    const { item, matter, member, teamAdmin } = await setup();
    const otherMatter = createMatterFixture(db, matter.teamId);
    const otherItem = createItemFixture(db, otherMatter.id);

    const otherRecord = await teamAdmin.client.records.today({
      matterId: otherMatter.id,
    });

    const crossItem = await captureOrpcError(
      member.client.exceptions.create({
        description: "跨事项物品",
        itemId: otherItem.id,
        matterId: matter.id,
        type: "other",
      })
    );

    const crossRecord = await captureOrpcError(
      member.client.exceptions.create({
        description: "跨事项记录",
        matterId: matter.id,
        recordId: otherRecord.id,
        type: "other",
      })
    );

    expect([crossItem.code, crossRecord.code]).toStrictEqual([
      "NOT_FOUND",
      "NOT_FOUND",
    ]);

    const record = await teamAdmin.client.records.today({
      matterId: matter.id,
    });

    const linked = await member.client.exceptions.create({
      description: "数量不符",
      itemId: item.id,
      matterId: matter.id,
      recordId: record.id,
      type: "count_mismatch",
    });

    expect(linked.recordId).toBe(record.id);

    const detail = await teamAdmin.client.records.get({ id: record.id });
    expect(detail.exceptions.map((row) => row.id)).toContain(linked.id);
  });

  it("管理员处置异常，重复处置冲突", async () => {
    const { matter, member, teamAdmin } = await setup();

    const created = await member.client.exceptions.create({
      description: "地面滴水",
      matterId: matter.id,
      type: "other",
    });

    const memberBlocked = await captureOrpcError(
      member.client.exceptions.resolve({
        id: created.id,
        resolution: "已清理",
      })
    );

    expect(memberBlocked.code).toBe("FORBIDDEN");

    const resolved = await teamAdmin.client.exceptions.resolve({
      id: created.id,
      resolution: "已更换设备",
    });

    expect(resolved).toMatchObject({
      resolution: "已更换设备",
      resolvedByName: teamAdmin.session?.user.name ?? "",
      status: "resolved",
    });

    const duplicate = await captureOrpcError(
      teamAdmin.client.exceptions.resolve({
        id: created.id,
        resolution: "再次处置",
      })
    );

    expect(duplicate.code).toBe("CONFLICT");

    const resolvedList = await teamAdmin.client.exceptions.list({
      matterId: matter.id,
      status: "resolved",
    });

    expect(resolvedList.items.map((row) => row.id)).toContain(created.id);
  });

  it("异常事件按团队隔离", async () => {
    const { matter, teamAdmin } = await setup();

    const mine = await teamAdmin.client.exceptions.create({
      description: "本团队异常",
      matterId: matter.id,
      type: "other",
    });

    const otherTeam = createTeamFixture(db);

    const otherAdmin = await createTestUser({
      role: "team_admin",
      teamId: otherTeam.id,
    });

    const crossMatter = await captureOrpcError(
      otherAdmin.client.exceptions.list({ matterId: matter.id })
    );

    const crossTeam = await captureOrpcError(
      otherAdmin.client.exceptions.list({ teamId: matter.teamId })
    );

    const crossResolve = await captureOrpcError(
      otherAdmin.client.exceptions.resolve({
        id: mine.id,
        resolution: "越权",
      })
    );

    expect([crossMatter.code, crossTeam.code, crossResolve.code]).toStrictEqual(
      ["NOT_FOUND", "NOT_FOUND", "NOT_FOUND"]
    );

    const otherList = await otherAdmin.client.exceptions.list({});
    expect(otherList.total).toBe(0);
  });
});
