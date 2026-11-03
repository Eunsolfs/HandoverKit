import { describe, expect, it } from "vite-plus/test";

import { createClient, createTestUser, db } from "../support/api.ts";
import {
  captureOrpcError,
  createItemFixture,
  createMatterFixture,
  createTeamFixture,
} from "../support/fixtures.ts";

describe("matters", () => {
  it("未登录不能访问交接事项", async () => {
    const error = await captureOrpcError(createClient().matters.list({}));

    expect(error.code).toBe("UNAUTHORIZED");
  });

  it("管理员创建事项并生成二维码，成员只读", async () => {
    const team = createTeamFixture(db);

    const teamAdmin = await createTestUser({
      role: "team_admin",
      teamId: team.id,
    });

    const member = await createTestUser({ role: "member", teamId: team.id });

    const created = await teamAdmin.client.matters.create({
      code: "ROOM-1",
      description: "抢救车",
      name: "抢救车",
    });

    expect(created).toMatchObject({
      code: "ROOM-1",
      itemCount: 0,
      name: "抢救车",
      qrVersion: 1,
      status: "active",
      teamId: team.id,
      teamName: team.name,
      todayStatus: null,
    });
    expect(created.qrToken.length).toBeGreaterThanOrEqual(32);
    expect(created.qrVersion).toBe(1);

    const listed = await member.client.matters.list({});
    expect(listed.map((matter) => matter.id)).toStrictEqual([created.id]);

    const createBlocked = await captureOrpcError(
      member.client.matters.create({ name: "无权限事项" })
    );

    const rotateBlocked = await captureOrpcError(
      member.client.matters.rotateQr({ id: created.id })
    );

    expect([createBlocked.code, rotateBlocked.code]).toStrictEqual([
      "FORBIDDEN",
      "FORBIDDEN",
    ]);
  });

  it("同一团队内事项名称唯一，跨团队可重名", async () => {
    const teamA = createTeamFixture(db);
    const teamB = createTeamFixture(db);

    const adminA = await createTestUser({
      role: "team_admin",
      teamId: teamA.id,
    });

    const adminB = await createTestUser({
      role: "team_admin",
      teamId: teamB.id,
    });

    await adminA.client.matters.create({ name: "治疗车" });

    const duplicate = await captureOrpcError(
      adminA.client.matters.create({ name: "治疗车" })
    );

    const teamBMatter = await adminB.client.matters.create({ name: "治疗车" });

    expect(duplicate.code).toBe("CONFLICT");
    expect(teamBMatter.teamId).toBe(teamB.id);
  });

  it("跨团队读取与二维码访问返回 NOT_FOUND", async () => {
    const teamA = createTeamFixture(db);
    const teamB = createTeamFixture(db);

    const adminB = await createTestUser({
      role: "team_admin",
      teamId: teamB.id,
    });

    const matterA = createMatterFixture(db, teamA.id);

    const calls = [
      adminB.client.matters.list({ teamId: teamA.id }),
      adminB.client.matters.byToken({ token: matterA.qrToken }),
      adminB.client.matters.update({ id: matterA.id, name: "改不了" }),
      adminB.client.records.today({ matterId: matterA.id }),
    ];

    const codes = await Promise.all(
      calls.map(async (call) => {
        const captured = await captureOrpcError(call);

        return captured.code;
      })
    );

    expect(codes).toStrictEqual([
      "NOT_FOUND",
      "NOT_FOUND",
      "NOT_FOUND",
      "NOT_FOUND",
    ]);
  });

  it("二维码变更后旧码立即失效且版本递增", async () => {
    const team = createTeamFixture(db);

    const teamAdmin = await createTestUser({
      role: "team_admin",
      teamId: team.id,
    });

    const matter = await teamAdmin.client.matters.create({ name: "换药车" });
    const rotated = await teamAdmin.client.matters.rotateQr({ id: matter.id });

    expect(rotated.qrVersion).toBe(2);
    expect(rotated.qrToken).not.toBe(matter.qrToken);

    const oldCode = await captureOrpcError(
      teamAdmin.client.matters.byToken({ token: matter.qrToken })
    );

    expect(oldCode.code).toBe("NOT_FOUND");

    const scanned = await teamAdmin.client.matters.byToken({
      token: rotated.qrToken,
    });

    expect(scanned.matter.id).toBe(matter.id);
  });

  it("扫码返回当日清单快照、物品与团队", async () => {
    const team = createTeamFixture(db);

    const teamAdmin = await createTestUser({
      role: "team_admin",
      teamId: team.id,
    });

    const member = await createTestUser({ role: "member", teamId: team.id });
    const matter = await teamAdmin.client.matters.create({ name: "急救箱" });

    const activeItem = createItemFixture(db, matter.id, {
      name: "纱布",
      stock: 7,
      unit: "包",
    });

    createItemFixture(db, matter.id, {
      name: "停用物品",
      status: "archived",
      stock: 3,
    });

    const scanned = await member.client.matters.byToken({
      token: matter.qrToken,
    });

    expect(scanned.team.id).toBe(team.id);
    expect(scanned.items.map((item) => item.id)).toStrictEqual([activeItem.id]);
    expect(scanned.today.items[0]).toMatchObject({
      expectedQty: 7,
      itemId: activeItem.id,
      itemName: "纱布",
      unit: "包",
    });
    expect(scanned.matter.todayStatus).toBe("pending_acceptance");

    const again = await member.client.matters.byToken({
      token: matter.qrToken,
    });

    expect(again.today.id).toBe(scanned.today.id);
  });

  it("管理员可编辑与归档事项", async () => {
    const team = createTeamFixture(db);

    const teamAdmin = await createTestUser({
      role: "team_admin",
      teamId: team.id,
    });

    const matter = await teamAdmin.client.matters.create({ name: "旧事项" });

    const updated = await teamAdmin.client.matters.update({
      code: "NEW",
      description: "新描述",
      id: matter.id,
      name: "新事项",
    });

    expect(updated).toMatchObject({
      code: "NEW",
      description: "新描述",
      name: "新事项",
    });

    const archived = await teamAdmin.client.matters.archive({ id: matter.id });
    expect(archived.status).toBe("archived");

    const activeList = await teamAdmin.client.matters.list({});
    expect(activeList).toStrictEqual([]);

    const archivedList = await teamAdmin.client.matters.list({
      includeArchived: true,
    });

    expect(archivedList.map((row) => row.id)).toStrictEqual([matter.id]);
  });
});
