import { describe, expect, it } from "vite-plus/test";

import { createClient, createTestUser, db } from "../support/api.ts";
import {
  captureOrpcError,
  createItemFixture,
  createMatterFixture,
  createTeamFixture,
} from "../support/fixtures.ts";

const captureAllCodes = async (calls: Promise<unknown>[]) => {
  const captured = await Promise.all(
    calls.map(async (call) => {
      const error = await captureOrpcError(call);

      return error.code;
    })
  );

  return captured;
};

describe("permissions", () => {
  it("所有业务 procedure 对匿名调用返回 UNAUTHORIZED", async () => {
    const client = createClient();
    const token = "a".repeat(32);

    const calls: Promise<unknown>[] = [
      client.me.get(),
      client.me.changePassword({
        currentPassword: "x",
        newPassword: "Passw0rd123",
      }),
      client.teams.list(),
      client.teams.create({ code: "T1", name: "团队" }),
      client.teams.update({ id: "x" }),
      client.teams.remove({ id: "x" }),
      client.users.list({}),
      client.users.create({
        name: "用户",
        password: "Passw0rd123",
        role: "member",
        username: "user001",
      }),
      client.users.update({ id: "x" }),
      client.users.resetPassword({ id: "x", newPassword: "Passw0rd123" }),
      client.users.remove({ id: "x" }),
      client.matters.list({}),
      client.matters.create({ name: "事项" }),
      client.matters.update({ id: "x" }),
      client.matters.rotateQr({ id: "x" }),
      client.matters.byToken({ token }),
      client.matters.archive({ id: "x" }),
      client.items.list({ matterId: "x" }),
      client.items.create({ matterId: "x", name: "物品", unit: "个" }),
      client.items.update({ id: "x" }),
      client.items.inbound({ id: "x", quantity: 1 }),
      client.items.adjust({ id: "x", note: "x", quantityDelta: 1 }),
      client.items.movements({ itemId: "x" }),
      client.items.remove({ id: "x" }),
      client.records.today({ matterId: "x" }),
      client.records.list({}),
      client.records.get({ id: "x" }),
      client.records.accept({ id: "x", items: [] }),
      client.records.submitHandover({ id: "x", items: [] }),
      client.records.remove({ id: "x" }),
      client.usage.list({}),
      client.usage.get({ id: "x" }),
      client.usage.create({
        items: [{ itemId: "x", quantity: 1 }],
        matterId: "x",
        patientName: "患者",
        patientNo: "P1",
        patientType: "outpatient",
        usedAt: "2026-05-01",
      }),
      client.usage.requestRevoke({ id: "x", reason: "原因" }),
      client.usage.pendingRevokes({}),
      client.usage.reviewRevoke({ approve: true, requestId: "x" }),
      client.exceptions.list({}),
      client.exceptions.create({
        description: "异常",
        matterId: "x",
        type: "other",
      }),
      client.exceptions.resolve({ id: "x", resolution: "处理" }),
      client.stats.overview({ period: "week" }),
    ];

    const codes = await captureAllCodes(calls);

    expect(codes).toStrictEqual(calls.map(() => "UNAUTHORIZED"));
  });

  it("普通成员调用管理员 procedure 返回 FORBIDDEN", async () => {
    const team = createTeamFixture(db);
    const member = await createTestUser({ role: "member", teamId: team.id });

    const calls: Promise<unknown>[] = [
      member.client.teams.list(),
      member.client.teams.create({ code: "T9", name: "团队9" }),
      member.client.users.list({}),
      member.client.users.create({
        name: "用户",
        password: "Passw0rd123",
        role: "member",
        username: "member002",
      }),
      member.client.users.update({ id: "x" }),
      member.client.users.resetPassword({
        id: "x",
        newPassword: "Passw0rd123",
      }),
      member.client.users.remove({ id: "x" }),
      member.client.matters.create({ name: "事项" }),
      member.client.matters.update({ id: "x" }),
      member.client.matters.rotateQr({ id: "x" }),
      member.client.matters.archive({ id: "x" }),
      member.client.items.create({ matterId: "x", name: "物品", unit: "个" }),
      member.client.items.update({ id: "x" }),
      member.client.items.inbound({ id: "x", quantity: 1 }),
      member.client.items.adjust({ id: "x", note: "x", quantityDelta: 1 }),
      member.client.items.remove({ id: "x" }),
      member.client.records.remove({ id: "x" }),
      member.client.usage.pendingRevokes({}),
      member.client.usage.reviewRevoke({ approve: true, requestId: "x" }),
      member.client.exceptions.resolve({ id: "x", resolution: "处理" }),
      member.client.stats.overview({ period: "week" }),
    ];

    const codes = await captureAllCodes(calls);

    expect(codes).toStrictEqual(calls.map(() => "FORBIDDEN"));
  });

  it("团队管理员不能执行超级管理员操作", async () => {
    const team = createTeamFixture(db);

    const teamAdmin = await createTestUser({
      role: "team_admin",
      teamId: team.id,
    });

    const calls: Promise<unknown>[] = [
      teamAdmin.client.teams.list(),
      teamAdmin.client.teams.create({ code: "T8", name: "团队8" }),
      teamAdmin.client.teams.update({ id: "x" }),
      teamAdmin.client.teams.remove({ id: "x" }),
    ];

    const codes = await captureAllCodes(calls);

    expect(codes).toStrictEqual(calls.map(() => "FORBIDDEN"));
  });

  it("普通成员只读本团队数据，跨团队一律 NOT_FOUND", async () => {
    const teamA = createTeamFixture(db);
    const teamB = createTeamFixture(db);
    const member = await createTestUser({ role: "member", teamId: teamA.id });
    const matterA = createMatterFixture(db, teamA.id);
    const matterB = createMatterFixture(db, teamB.id);
    const itemB = createItemFixture(db, matterB.id);

    const adminB = await createTestUser({
      role: "team_admin",
      teamId: teamB.id,
    });

    const recordB = await adminB.client.records.today({
      matterId: matterB.id,
    });

    const calls: Promise<unknown>[] = [
      member.client.matters.list({ teamId: teamB.id }),
      member.client.matters.byToken({ token: matterB.qrToken }),
      member.client.items.list({ matterId: matterB.id }),
      member.client.items.movements({ itemId: itemB.id }),
      member.client.records.today({ matterId: matterB.id }),
      member.client.records.get({ id: recordB.id }),
      member.client.records.list({ matterId: matterB.id }),
      member.client.usage.list({ matterId: matterB.id }),
      member.client.exceptions.list({ matterId: matterB.id }),
    ];

    const codes = await captureAllCodes(calls);
    expect(codes).toStrictEqual(calls.map(() => "NOT_FOUND"));

    const ownItems = await member.client.items.list({ matterId: matterA.id });
    expect(ownItems).toStrictEqual([]);
  });
});
