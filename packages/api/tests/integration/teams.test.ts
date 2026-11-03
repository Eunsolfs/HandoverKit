import { describe, expect, it } from "vite-plus/test";

import { createClient, createTestUser, db } from "../support/api.ts";
import {
  captureOrpcError,
  createMatterFixture,
  createTeamFixture,
} from "../support/fixtures.ts";

describe("teams", () => {
  it("未登录请求团队列表返回 UNAUTHORIZED", async () => {
    const error = await captureOrpcError(createClient().teams.list());

    expect(error.code).toBe("UNAUTHORIZED");
  });

  it("普通用户与团队管理员不能访问团队管理", async () => {
    const team = createTeamFixture(db);
    const member = await createTestUser({ role: "member", teamId: team.id });

    const teamAdmin = await createTestUser({
      role: "team_admin",
      teamId: team.id,
    });

    const calls = [
      member.client.teams.list(),
      teamAdmin.client.teams.create({ code: "NEW-TEAM", name: "新团队" }),
    ];

    const codes = await Promise.all(
      calls.map(async (call) => {
        const captured = await captureOrpcError(call);

        return captured.code;
      })
    );

    expect(codes).toStrictEqual(["FORBIDDEN", "FORBIDDEN"]);
  });

  it("超级管理员创建、编辑、停用与删除团队", async () => {
    const admin = await createTestUser({ role: "super_admin" });

    const created = await admin.client.teams.create({
      code: "ICU",
      description: "重症监护",
      name: "ICU 团队",
      timezone: "Asia/Shanghai",
    });

    expect(created).toMatchObject({
      code: "ICU",
      description: "重症监护",
      memberCount: 0,
      matterCount: 0,
      name: "ICU 团队",
      status: "active",
      timezone: "Asia/Shanghai",
    });
    expect(Number.isInteger(created.createdAt)).toBeTruthy();

    const updated = await admin.client.teams.update({
      id: created.id,
      name: "ICU 一组",
      status: "archived",
    });

    expect(updated).toMatchObject({ name: "ICU 一组", status: "archived" });

    await admin.client.teams.remove({ id: created.id });
    const afterRemoval = await admin.client.teams.list();
    expect(afterRemoval.map((team) => team.id)).not.toContain(created.id);
  });

  it("团队名称/编码唯一且时区必须合法", async () => {
    const admin = await createTestUser({ role: "super_admin" });
    await admin.client.teams.create({ code: "OPD", name: "门诊团队" });

    const duplicateName = await captureOrpcError(
      admin.client.teams.create({ code: "OPD2", name: "门诊团队" })
    );

    const duplicateCode = await captureOrpcError(
      admin.client.teams.create({ code: "OPD", name: "门诊团队二" })
    );

    const badTimeZone = await captureOrpcError(
      admin.client.teams.create({
        code: "BAD",
        name: "时区团队",
        timezone: "Mars/Olympus",
      })
    );

    expect([
      duplicateName.code,
      duplicateCode.code,
      badTimeZone.code,
    ]).toStrictEqual(["CONFLICT", "CONFLICT", "BAD_REQUEST"]);

    const listed = await admin.client.teams.list();
    expect(listed.map((team) => team.code)).toContain("OPD");
  });

  it("团队下存在用户或事项时不能删除", async () => {
    const admin = await createTestUser({ role: "super_admin" });
    const withMember = createTeamFixture(db);
    await createTestUser({ role: "member", teamId: withMember.id });
    const withMatter = createTeamFixture(db);
    createMatterFixture(db, withMatter.id);

    const memberBlocked = await captureOrpcError(
      admin.client.teams.remove({ id: withMember.id })
    );

    const matterBlocked = await captureOrpcError(
      admin.client.teams.remove({ id: withMatter.id })
    );

    expect([memberBlocked.code, matterBlocked.code]).toStrictEqual([
      "CONFLICT",
      "CONFLICT",
    ]);

    const emptyTeam = createTeamFixture(db);
    await admin.client.teams.remove({ id: emptyTeam.id });
    const remaining = await admin.client.teams.list();
    expect(remaining.map((team) => team.id)).not.toContain(emptyTeam.id);
  });
});
