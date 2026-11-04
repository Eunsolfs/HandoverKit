import { describe, expect, it } from "vite-plus/test";

import { createTestUser, db } from "../support/api.ts";
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

  return { member, matter, teamAdmin };
};

const acceptAll = async (
  client: Awaited<ReturnType<typeof createTestUser>>["client"],
  record: {
    id: string;
    items: { itemId: string; expectedQty: number }[];
  }
) =>
  await client.records.accept({
    id: record.id,
    items: record.items.map((item) => ({
      actualQty: item.expectedQty,
      checked: true,
      itemId: item.itemId,
    })),
  });

describe("sub warehouses", () => {
  it("按子仓库独立生成清单与交接记录，并允许跨仓消耗", async () => {
    const { member, matter, teamAdmin } = await setup();

    const defaultWarehouse = await teamAdmin.client.subWarehouses
      .list({ matterId: matter.id })
      .then((rows) => rows[0]);

    const second = await teamAdmin.client.subWarehouses.create({
      location: "住院部二楼",
      matterId: matter.id,
      name: "住院仓库",
    });

    const itemA = createItemFixture(db, matter.id, {
      name: "门诊纱布",
      stock: 10,
      unit: "包",
    });

    const itemB = await teamAdmin.client.items.create({
      name: "住院纱布",
      stock: 5,
      subWarehouseId: second.id,
      unit: "包",
    });

    const scanned = await member.client.matters.byToken({
      token: matter.qrToken,
    });

    expect({
      itemIds: scanned.items.map((row) => row.id),
      selected: scanned.selectedSubWarehouseId,
      subWarehouseIds: scanned.subWarehouses.map((row) => row.id),
      todayItemIds: scanned.today.items.map((row) => row.itemId),
    }).toStrictEqual({
      itemIds: [itemA.id, itemB.id],
      selected: defaultWarehouse?.id,
      subWarehouseIds: [defaultWarehouse?.id, second.id],
      todayItemIds: [itemA.id],
    });

    const secondRecord = await member.client.records.today({
      matterId: matter.id,
      subWarehouseId: second.id,
    });

    expect({
      itemIds: secondRecord.items.map((row) => row.itemId),
      sameAsDefault: secondRecord.id === scanned.today.id,
    }).toStrictEqual({ itemIds: [itemB.id], sameAsDefault: false });

    await acceptAll(member.client, scanned.today);

    const blocked = await captureOrpcError(
      member.client.usage.create({
        items: [{ itemId: itemB.id, quantity: 1 }],
        matterId: matter.id,
        patientName: "住院患者",
        patientNo: "SW1",
        patientType: "inpatient",
        subWarehouseId: second.id,
        usedAt: secondRecord.recordDate,
      })
    );

    expect(blocked.code).toBe("CONFLICT");

    await acceptAll(member.client, secondRecord);

    const usage = await member.client.usage.create({
      items: [{ itemId: itemA.id, quantity: 2 }],
      matterId: matter.id,
      patientName: "住院患者",
      patientNo: "SW2",
      patientType: "inpatient",
      subWarehouseId: second.id,
      usedAt: secondRecord.recordDate,
    });

    expect({
      itemSource: usage.items[0]?.sourceSubWarehouseName,
      sessionWarehouse: usage.subWarehouseId,
    }).toStrictEqual({
      itemSource: "主仓库",
      sessionWarehouse: second.id,
    });

    const rows = await member.client.items.list({ matterId: matter.id });
    expect({
      itemAStock: rows.find((row) => row.id === itemA.id)?.stock,
      itemBStock: rows.find((row) => row.id === itemB.id)?.stock,
    }).toStrictEqual({ itemAStock: 8, itemBStock: 5 });
  });

  it("调拨在子仓库间移动库存，并自动为调入仓库建档", async () => {
    const { matter, teamAdmin } = await setup();

    const defaultWarehouse = await teamAdmin.client.subWarehouses
      .list({ matterId: matter.id })
      .then((rows) => rows[0]);

    const second = await teamAdmin.client.subWarehouses.create({
      matterId: matter.id,
      name: "门诊仓库",
    });

    const source = createItemFixture(db, matter.id, {
      name: "调拨纱布",
      stock: 10,
      unit: "包",
    });

    const transfer = await teamAdmin.client.items.transfer({
      fromSubWarehouseId: defaultWarehouse?.id ?? "",
      itemId: source.id,
      note: "住院部借用",
      quantity: 3,
      toSubWarehouseId: second.id,
    });

    const sourceRows = await teamAdmin.client.items.list({
      subWarehouseId: defaultWarehouse?.id,
    });

    const targetRows = await teamAdmin.client.items.list({
      subWarehouseId: second.id,
    });

    const transfers = await teamAdmin.client.items.transfers({
      matterId: matter.id,
    });

    expect({
      quantity: transfer.quantity,
      fromName: transfer.fromSubWarehouseName,
      toName: transfer.toSubWarehouseName,
    }).toStrictEqual({
      fromName: "主仓库",
      quantity: 3,
      toName: "门诊仓库",
    });

    expect({
      sourceStock: sourceRows.find((row) => row.id === source.id)?.stock,
      targetCount: targetRows.length,
      targetStock: targetRows[0]?.stock,
    }).toStrictEqual({ sourceStock: 7, targetCount: 1, targetStock: 3 });

    expect(transfers).toHaveLength(1);

    const sameWarehouse = await captureOrpcError(
      teamAdmin.client.items.transfer({
        fromSubWarehouseId: defaultWarehouse?.id ?? "",
        itemId: source.id,
        quantity: 1,
        toSubWarehouseId: defaultWarehouse?.id ?? "",
      })
    );

    const insufficient = await captureOrpcError(
      teamAdmin.client.items.transfer({
        fromSubWarehouseId: defaultWarehouse?.id ?? "",
        itemId: source.id,
        quantity: 999,
        toSubWarehouseId: second.id,
      })
    );

    expect([sameWarehouse.code, insufficient.code]).toStrictEqual([
      "BAD_REQUEST",
      "CONFLICT",
    ]);
  });

  it("有库存的子仓库不能直接停用", async () => {
    const { matter, teamAdmin } = await setup();

    const warehouse = await teamAdmin.client.subWarehouses.create({
      matterId: matter.id,
      name: "待停用仓库",
    });

    await teamAdmin.client.items.create({
      name: "留存物品",
      stock: 5,
      subWarehouseId: warehouse.id,
      unit: "个",
    });

    const blocked = await captureOrpcError(
      teamAdmin.client.subWarehouses.update({
        id: warehouse.id,
        status: "archived",
      })
    );

    expect(blocked.code).toBe("CONFLICT");
  });
});
