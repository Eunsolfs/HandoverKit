import { describe, expect, it } from "vite-plus/test";

import { verifyCredentialPassword } from "@handoverkit/auth";

import { auth, createClient, createTestUser, db } from "../support/api.ts";
import {
  captureOrpcError,
  createItemFixture,
  createMatterFixture,
  createTeamFixture,
} from "../support/fixtures.ts";

const password = "Passw0rd123";

describe("users", () => {
  it("未登录与普通成员不能访问用户管理", async () => {
    const team = createTeamFixture(db);
    const member = await createTestUser({ role: "member", teamId: team.id });

    const calls = [
      createClient().users.list({}),
      member.client.users.list({}),
      member.client.users.create({
        name: "新用户",
        password,
        role: "member",
        username: "newbie",
      }),
    ];

    const codes = await Promise.all(
      calls.map(async (call) => {
        const captured = await captureOrpcError(call);

        return captured.code;
      })
    );

    expect(codes).toStrictEqual(["UNAUTHORIZED", "FORBIDDEN", "FORBIDDEN"]);
  });

  it("超级管理员可跨团队创建团队管理员与成员", async () => {
    const admin = await createTestUser({ role: "super_admin" });
    const teamA = createTeamFixture(db);
    const teamB = createTeamFixture(db);

    const teamAdmin = await admin.client.users.create({
      name: "团队管理员",
      password,
      role: "team_admin",
      teamId: teamA.id,
      username: "TeamAdminA",
    });

    const member = await admin.client.users.create({
      name: "成员甲",
      password,
      role: "member",
      teamId: teamB.id,
      username: "memberb",
    });

    expect(teamAdmin).toMatchObject({
      role: "team_admin",
      status: "active",
      teamId: teamA.id,
      teamName: teamA.name,
      username: "teamadmina",
    });
    expect(member.teamId).toBe(teamB.id);

    const teamUsers = await admin.client.users.list({ teamId: teamA.id });
    expect(teamUsers.map((row) => row.id)).toStrictEqual([teamAdmin.id]);

    const admins = await admin.client.users.list({ role: "team_admin" });
    expect(admins.map((row) => row.username)).toContain("teamadmina");

    const signedIn = await auth.api.signInUsername({
      body: { password, username: "teamadmina" },
    });

    expect(signedIn).toBeTruthy();
  });

  it("登录名唯一（大小写不敏感）且密码/登录名格式受限", async () => {
    const admin = await createTestUser({ role: "super_admin" });
    const team = createTeamFixture(db);
    await admin.client.users.create({
      name: "护士长",
      password,
      role: "team_admin",
      teamId: team.id,
      username: "Nurse",
    });

    const duplicate = await captureOrpcError(
      admin.client.users.create({
        name: "重复账号",
        password,
        role: "member",
        teamId: team.id,
        username: "nurse",
      })
    );

    const weakPassword = await captureOrpcError(
      admin.client.users.create({
        name: "弱密码",
        password: "abcdefgh",
        role: "member",
        teamId: team.id,
        username: "weakpass",
      })
    );

    const badUsername = await captureOrpcError(
      admin.client.users.create({
        name: "非法登录名",
        password,
        role: "member",
        teamId: team.id,
        username: "a b",
      })
    );

    expect([duplicate.code, weakPassword.code, badUsername.code]).toStrictEqual(
      ["CONFLICT", "BAD_REQUEST", "BAD_REQUEST"]
    );
  });

  it("团队管理员只能创建本团队普通成员", async () => {
    const teamA = createTeamFixture(db);
    const teamB = createTeamFixture(db);

    const teamAdmin = await createTestUser({
      role: "team_admin",
      teamId: teamA.id,
    });

    const member = await teamAdmin.client.users.create({
      name: "本团队成员",
      password,
      role: "member",
      username: "teammember",
    });

    expect(member.teamId).toBe(teamA.id);

    const promoteBlocked = await captureOrpcError(
      teamAdmin.client.users.create({
        name: "越权管理员",
        password,
        role: "team_admin",
        username: "anotheradmin",
      })
    );

    const crossTeamBlocked = await captureOrpcError(
      teamAdmin.client.users.create({
        name: "越团队用户",
        password,
        role: "member",
        teamId: teamB.id,
        username: "crossuser",
      })
    );

    expect([promoteBlocked.code, crossTeamBlocked.code]).toStrictEqual([
      "FORBIDDEN",
      "NOT_FOUND",
    ]);
  });

  it("团队管理员只能看到并管理本团队普通成员", async () => {
    const teamA = createTeamFixture(db);
    const teamB = createTeamFixture(db);

    const teamAdmin = await createTestUser({
      role: "team_admin",
      teamId: teamA.id,
    });

    const member = await createTestUser({ role: "member", teamId: teamA.id });

    const otherAdmin = await createTestUser({
      role: "team_admin",
      teamId: teamB.id,
    });

    const listed = await teamAdmin.client.users.list({});
    expect(listed.map((row) => row.id)).toContain(member.id);
    expect(listed.map((row) => row.id)).not.toContain(otherAdmin.id);

    const crossTeamBlocked = await captureOrpcError(
      teamAdmin.client.users.update({ id: otherAdmin.id, name: "改名" })
    );

    expect(crossTeamBlocked.code).toBe("NOT_FOUND");
  });

  it("不能修改自己的角色或状态", async () => {
    const team = createTeamFixture(db);

    const teamAdmin = await createTestUser({
      role: "team_admin",
      teamId: team.id,
    });

    const roleBlocked = await captureOrpcError(
      teamAdmin.client.users.update({ id: teamAdmin.id, role: "member" })
    );

    const statusBlocked = await captureOrpcError(
      teamAdmin.client.users.update({ id: teamAdmin.id, status: "disabled" })
    );

    expect([roleBlocked.code, statusBlocked.code]).toStrictEqual([
      "FORBIDDEN",
      "FORBIDDEN",
    ]);
  });

  it("停用账号后已登录会话立即失效", async () => {
    const team = createTeamFixture(db);

    const teamAdmin = await createTestUser({
      role: "team_admin",
      teamId: team.id,
    });

    const member = await createTestUser({ role: "member", teamId: team.id });

    const disabled = await teamAdmin.client.users.update({
      id: member.id,
      status: "disabled",
    });

    expect(disabled.status).toBe("disabled");

    const blocked = await captureOrpcError(member.client.me.get());
    expect(blocked.code).toBe("UNAUTHORIZED");
  });

  it("管理员重置密码后可使用新密码登录", async () => {
    const team = createTeamFixture(db);

    const teamAdmin = await createTestUser({
      role: "team_admin",
      teamId: team.id,
    });

    const member = await createTestUser({ role: "member", teamId: team.id });

    const reset = await teamAdmin.client.users.resetPassword({
      id: member.id,
      newPassword: "NewPassw0rd",
    });

    expect(reset).toStrictEqual({ ok: true });

    const verified = await verifyCredentialPassword(
      db,
      member.id,
      "NewPassw0rd"
    );

    expect(verified).toBeTruthy();

    const signedIn = await auth.api.signInUsername({
      body: { password: "NewPassw0rd", username: member.username },
    });

    expect(signedIn).toBeTruthy();
  });

  it("有业务记录的用户只能停用不能删除", async () => {
    const team = createTeamFixture(db);

    const teamAdmin = await createTestUser({
      role: "team_admin",
      teamId: team.id,
    });

    const member = await createTestUser({ role: "member", teamId: team.id });
    const matter = createMatterFixture(db, team.id);
    const item = createItemFixture(db, matter.id, { stock: 5 });

    await member.client.usage.create({
      items: [{ itemId: item.id, quantity: 1 }],
      matterId: matter.id,
      patientName: "张三",
      patientNo: "P001",
      patientType: "outpatient",
      usedAt: "2026-01-05",
    });

    const blocked = await captureOrpcError(
      teamAdmin.client.users.remove({ id: member.id })
    );

    expect(blocked.code).toBe("CONFLICT");

    const cleanUser = await createTestUser({ role: "member", teamId: team.id });
    await teamAdmin.client.users.remove({ id: cleanUser.id });

    const removed = await captureOrpcError(
      teamAdmin.client.users.update({ id: cleanUser.id, name: "不存在" })
    );

    expect(removed.code).toBe("NOT_FOUND");

    const selfRemoval = await captureOrpcError(
      teamAdmin.client.users.remove({ id: teamAdmin.id })
    );

    expect(selfRemoval.code).toBe("BAD_REQUEST");
  });
});
