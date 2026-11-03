/**
 * 易交接演示数据（幂等，可重复执行）。
 *
 * 运行方式（仓库根目录）：
 *   node scripts/seed-demo.ts
 *
 * 数据来源：读取 apps/server/.env 中的 DATABASE_URL（缺省 apps/server/local.db，
 * 相对路径按 apps/server 解析，与开发服务器一致）；空库会先执行迁移。
 *
 * 写入内容：示范团队、团队管理员/普通成员、两个交接事项（固定二维码 token）、
 * 物品与初始库存流水、历史已交班记录、消耗记录、1 条待审批撤销、1 条未解决异常。
 * 重复执行只重建「示范院区」团队下的演示数据，不删除其他团队或真实业务数据。
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { and, eq, inArray } from "drizzle-orm";

import { createCredentialUser, setCredentialPassword } from "@handoverkit/auth";
import { createDb } from "@handoverkit/db";
import { migrateDatabase } from "@handoverkit/db/migrate";
import { user } from "@handoverkit/db/schema/auth";
import {
  exceptionEvent,
  handoverRecord,
  handoverRecordItem,
  item,
  matter,
  revokeRequest,
  stockMovement,
  team,
  usageItem,
  usageRecord,
} from "@handoverkit/db/schema/handover";

const serverDir = fileURLToPath(new URL("../apps/server", import.meta.url));
const envFile = path.join(serverDir, ".env");

if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const databaseUrl = process.env.DATABASE_URL ?? "local.db";

const databasePath = path.isAbsolute(databaseUrl)
  ? databaseUrl
  : path.resolve(serverDir, databaseUrl);

const db = createDb(databasePath);

migrateDatabase(db);

const TIME_ZONE = "Asia/Shanghai";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: TIME_ZONE,
  year: "numeric",
});

type OperatorKey = "teamadmin" | "nurse";

interface DemoUser {
  username: string;
  password: string;
  name: string;
  role: "team_admin" | "member";
  phone: string;
}

interface DemoItemSeed {
  key: string;
  name: string;
  spec: string;
  unit: string;
  category: string;
  stock: number;
  minStock: number;
  location: string;
}

interface DemoMatterSeed {
  id: string;
  key: string;
  name: string;
  code: string;
  description: string;
  qrToken: string;
  items: DemoItemSeed[];
}

interface DemoUsageSeed {
  id: string;
  matterKey: string;
  dayOffset: number;
  patientName: string;
  patientType: "outpatient" | "inpatient";
  patientNoPrefix: "ZY" | "MZ";
  patientPhone: string | null;
  operator: OperatorKey;
  note: string;
  status: "active" | "revoke_pending";
  lines: { itemKey: string; quantity: number }[];
}

const DEMO_TEAM_ID = "demo-team-shiyuan";
const DEMO_TEAM_CODE = "DEMO";
const DEMO_TEAM_NAME = "示范院区";
const DEMO_TEAM_DESCRIPTION = "演示环境：两个交接事项、历史交接与用物记录";
const DIFF_ITEM_KEY = "gauze";
const HISTORY_OFFSETS = [-2, -1] as const;

const demoUsers: DemoUser[] = [
  {
    name: "王敏",
    password: "Team@123456",
    phone: "13800000001",
    role: "team_admin",
    username: "teamadmin",
  },
  {
    name: "李婷",
    password: "Nurse@123456",
    phone: "13800000002",
    role: "member",
    username: "nurse",
  },
];

const demoMatters: DemoMatterSeed[] = [
  {
    code: "ER",
    description: "急诊处置室用物仓库，演示扫码交接全流程",
    id: "demo-matter-emergency",
    items: [
      {
        category: "防护",
        key: "gloves",
        location: "A-01",
        minStock: 40,
        name: "一次性无菌手套",
        spec: "M 号",
        stock: 120,
        unit: "副",
      },
      {
        category: "防护",
        key: "mask",
        location: "A-02",
        minStock: 60,
        name: "医用外科口罩",
        spec: "成人款",
        stock: 200,
        unit: "包",
      },
      {
        category: "耗材",
        key: "infusion",
        location: "B-01",
        minStock: 20,
        name: "一次性输液器",
        spec: "带针",
        stock: 80,
        unit: "套",
      },
      {
        category: "消毒",
        key: "iodine",
        location: "C-01",
        minStock: 12,
        name: "碘伏消毒液",
        spec: "100ml",
        stock: 36,
        unit: "瓶",
      },
      {
        category: "敷料",
        key: "gauze",
        location: "D-01",
        minStock: 30,
        name: "无菌纱布块",
        spec: "7.5cm x 7.5cm",
        stock: 90,
        unit: "包",
      },
      {
        category: "敷料",
        key: "tape",
        location: "D-02",
        minStock: 15,
        name: "医用胶带",
        spec: "1.25cm x 9m",
        stock: 45,
        unit: "卷",
      },
      {
        category: "耗材",
        key: "syringe",
        location: "B-02",
        minStock: 50,
        name: "一次性注射器",
        spec: "5ml",
        stock: 150,
        unit: "支",
      },
    ],
    key: "emergency",
    name: "急诊处置室",
    qrToken: "1f0a7c9e4b2d63584a91c0e7f3b6d5829c4e7a1f0b3d68529a7c4e1f0b2d6358",
  },
  {
    code: "WARD",
    description: "内二科治疗室用物仓库，演示采血与输液耗材",
    id: "demo-matter-ward",
    items: [
      {
        category: "耗材",
        key: "bloodNeedle",
        location: "E-01",
        minStock: 30,
        name: "一次性采血针",
        spec: "21G",
        stock: 100,
        unit: "支",
      },
      {
        category: "耗材",
        key: "tube",
        location: "E-02",
        minStock: 40,
        name: "真空采血管",
        spec: "紫管 5ml",
        stock: 120,
        unit: "支",
      },
      {
        category: "耗材",
        key: "catheter",
        location: "E-03",
        minStock: 20,
        name: "留置针",
        spec: "24G",
        stock: 60,
        unit: "支",
      },
      {
        category: "敷料",
        key: "dressing",
        location: "E-04",
        minStock: 20,
        name: "透明敷贴",
        spec: "6cm x 7cm",
        stock: 70,
        unit: "张",
      },
      {
        category: "输液",
        key: "saline",
        location: "F-01",
        minStock: 15,
        name: "生理盐水",
        spec: "500ml",
        stock: 40,
        unit: "瓶",
      },
      {
        category: "耗材",
        key: "cotton",
        location: "F-02",
        minStock: 25,
        name: "医用棉签",
        spec: "10cm",
        stock: 80,
        unit: "包",
      },
    ],
    key: "ward",
    name: "内二科治疗室",
    qrToken: "7c2e9b1d4a6f8350e2c7b9a1d3f5684c0e7b2a9d1f3c56840b7e2a9c4d1f6835",
  },
];

const demoUsages: DemoUsageSeed[] = [
  {
    dayOffset: -2,
    id: "demo-usage-01",
    lines: [
      { itemKey: "gloves", quantity: 2 },
      { itemKey: "infusion", quantity: 1 },
    ],
    matterKey: "emergency",
    note: "夜班首例输液",
    operator: "nurse",
    patientName: "张伟",
    patientNoPrefix: "ZY",
    patientPhone: "13800001111",
    patientType: "inpatient",
    status: "active",
  },
  {
    dayOffset: -2,
    id: "demo-usage-02",
    lines: [
      { itemKey: "bloodNeedle", quantity: 3 },
      { itemKey: "tube", quantity: 3 },
    ],
    matterKey: "ward",
    note: "晨间采血",
    operator: "nurse",
    patientName: "李娜",
    patientNoPrefix: "MZ",
    patientPhone: null,
    patientType: "outpatient",
    status: "active",
  },
  {
    dayOffset: -1,
    id: "demo-usage-03",
    lines: [
      { itemKey: "mask", quantity: 10 },
      { itemKey: "gauze", quantity: 4 },
      { itemKey: "tape", quantity: 1 },
    ],
    matterKey: "emergency",
    note: "处置室换药",
    operator: "teamadmin",
    patientName: "王强",
    patientNoPrefix: "ZY",
    patientPhone: "13800002222",
    patientType: "inpatient",
    status: "active",
  },
  {
    dayOffset: -1,
    id: "demo-usage-04",
    lines: [
      { itemKey: "catheter", quantity: 2 },
      { itemKey: "dressing", quantity: 2 },
      { itemKey: "saline", quantity: 1 },
    ],
    matterKey: "ward",
    note: "门诊输液",
    operator: "nurse",
    patientName: "赵敏",
    patientNoPrefix: "MZ",
    patientPhone: null,
    patientType: "outpatient",
    status: "active",
  },
  {
    dayOffset: 0,
    id: "demo-usage-05",
    lines: [
      { itemKey: "syringe", quantity: 5 },
      { itemKey: "iodine", quantity: 1 },
    ],
    matterKey: "emergency",
    note: "患者取消输液，物品未使用，申请撤销恢复库存",
    operator: "nurse",
    patientName: "陈晨",
    patientNoPrefix: "ZY",
    patientPhone: "13800003333",
    patientType: "inpatient",
    status: "revoke_pending",
  },
];

const isoDate = (date: Date): string => dateFormatter.format(date);

const shiftDays = (date: string, days: number): string => {
  const [year = "1970", month = "1", day = "1"] = date.split("-");

  const shifted = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day) + days)
  );

  return isoDate(shifted);
};

const timestampAt = (date: string, time: string): Date =>
  new Date(`${date}T${time}:00+08:00`);

const today = isoDate(new Date());
const initialAt = timestampAt(shiftDays(today, -3), "09:00");

const itemId = (matterKey: string, itemKey: string): string =>
  `demo-item-${matterKey}-${itemKey}`;

const recordId = (matterKey: string, date: string): string =>
  `demo-record-${matterKey}-${date}`;

const findOrCreateTeam = (): string => {
  const [byCode] = db
    .select({ id: team.id })
    .from(team)
    .where(eq(team.code, DEMO_TEAM_CODE))
    .limit(1)
    .all();

  const [byName] = db
    .select({ id: team.id })
    .from(team)
    .where(eq(team.name, DEMO_TEAM_NAME))
    .limit(1)
    .all();

  const existing = byCode ?? byName;

  if (existing !== undefined) {
    db.update(team)
      .set({
        description: DEMO_TEAM_DESCRIPTION,
        name: DEMO_TEAM_NAME,
        status: "active",
        timezone: TIME_ZONE,
      })
      .where(eq(team.id, existing.id))
      .run();

    return existing.id;
  }

  db.insert(team)
    .values({
      code: DEMO_TEAM_CODE,
      createdAt: initialAt,
      description: DEMO_TEAM_DESCRIPTION,
      id: DEMO_TEAM_ID,
      name: DEMO_TEAM_NAME,
      status: "active",
      timezone: TIME_ZONE,
      updatedAt: initialAt,
    })
    .run();

  return DEMO_TEAM_ID;
};

interface DemoOperator {
  id: string;
  name: string;
}

type DemoOperators = Record<OperatorKey, DemoOperator>;

interface SeedContext {
  teamId: string;
  operators: DemoOperators;
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const ensureUser = async (demoUser: DemoUser, teamId: string) => {
  const username = demoUser.username.toLowerCase();

  const [existing] = db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.username, username))
    .limit(1)
    .all();

  if (existing !== undefined) {
    db.update(user)
      .set({
        displayUsername: demoUser.username,
        name: demoUser.name,
        phone: demoUser.phone,
        role: demoUser.role,
        status: "active",
        teamId,
      })
      .where(eq(user.id, existing.id))
      .run();
    await setCredentialPassword(db, existing.id, demoUser.password);

    return { id: existing.id, name: demoUser.name };
  }

  const id = await createCredentialUser(db, {
    name: demoUser.name,
    password: demoUser.password,
    phone: demoUser.phone,
    role: demoUser.role,
    teamId,
    username: demoUser.username,
  });

  return { id, name: demoUser.name };
};

const usagesFor = (matterKey: string) =>
  demoUsages.filter((usage) => usage.matterKey === matterKey);

const consumptionBefore = (
  matterKey: string,
  dayOffset: number
): Map<string, number> => {
  const consumed = new Map<string, number>();

  for (const usage of usagesFor(matterKey)) {
    if (usage.dayOffset >= dayOffset) {
      continue;
    }

    for (const line of usage.lines) {
      consumed.set(
        line.itemKey,
        (consumed.get(line.itemKey) ?? 0) + line.quantity
      );
    }
  }

  return consumed;
};

const finalStock = (matterSeed: DemoMatterSeed, itemKey: string): number => {
  const itemSeed = matterSeed.items.find(
    (itemDefinition) => itemDefinition.key === itemKey
  );

  if (itemSeed === undefined) {
    throw new Error(`演示数据缺少物品 ${matterSeed.key}/${itemKey}`);
  }

  let consumed = 0;

  for (const usage of usagesFor(matterSeed.key)) {
    for (const line of usage.lines) {
      if (line.itemKey === itemKey) {
        consumed += line.quantity;
      }
    }
  }

  return itemSeed.stock - consumed;
};

const removeDemoData = (tx: Transaction, teamId: string) => {
  const existingMatters = tx
    .select({ id: matter.id })
    .from(matter)
    .where(
      and(
        eq(matter.teamId, teamId),
        inArray(
          matter.name,
          demoMatters.map((matterSeed) => matterSeed.name)
        )
      )
    )
    .all();

  const fixedMatters = tx
    .select({ id: matter.id })
    .from(matter)
    .where(
      inArray(
        matter.id,
        demoMatters.map((matterSeed) => matterSeed.id)
      )
    )
    .all();

  const removedMatterIds = [
    ...new Set([...existingMatters, ...fixedMatters].map((row) => row.id)),
  ];

  if (removedMatterIds.length === 0) {
    return;
  }

  const oldUsageIds = tx
    .select({ id: usageRecord.id })
    .from(usageRecord)
    .where(inArray(usageRecord.matterId, removedMatterIds))
    .all()
    .map((row) => row.id);

  if (oldUsageIds.length > 0) {
    tx.delete(revokeRequest)
      .where(inArray(revokeRequest.usageId, oldUsageIds))
      .run();
    tx.delete(usageItem).where(inArray(usageItem.usageId, oldUsageIds)).run();
  }

  tx.delete(usageRecord)
    .where(inArray(usageRecord.matterId, removedMatterIds))
    .run();
  tx.delete(exceptionEvent)
    .where(inArray(exceptionEvent.matterId, removedMatterIds))
    .run();

  const oldRecordIds = tx
    .select({ id: handoverRecord.id })
    .from(handoverRecord)
    .where(inArray(handoverRecord.matterId, removedMatterIds))
    .all()
    .map((row) => row.id);

  if (oldRecordIds.length > 0) {
    tx.delete(handoverRecordItem)
      .where(inArray(handoverRecordItem.recordId, oldRecordIds))
      .run();
  }

  tx.delete(handoverRecord)
    .where(inArray(handoverRecord.matterId, removedMatterIds))
    .run();
  tx.delete(stockMovement)
    .where(inArray(stockMovement.matterId, removedMatterIds))
    .run();
  tx.delete(item).where(inArray(item.matterId, removedMatterIds)).run();
  tx.delete(matter).where(inArray(matter.id, removedMatterIds)).run();
};

const insertDemoMatters = (tx: Transaction, context: SeedContext) => {
  for (const matterSeed of demoMatters) {
    tx.insert(matter)
      .values({
        code: matterSeed.code,
        createdAt: initialAt,
        description: matterSeed.description,
        id: matterSeed.id,
        name: matterSeed.name,
        qrToken: matterSeed.qrToken,
        qrVersion: 1,
        status: "active",
        teamId: context.teamId,
        updatedAt: initialAt,
      })
      .run();

    for (const itemSeed of matterSeed.items) {
      tx.insert(item)
        .values({
          category: itemSeed.category,
          createdAt: initialAt,
          id: itemId(matterSeed.key, itemSeed.key),
          location: itemSeed.location,
          matterId: matterSeed.id,
          minStock: itemSeed.minStock,
          name: itemSeed.name,
          spec: itemSeed.spec,
          status: "active",
          stock: finalStock(matterSeed, itemSeed.key),
          unit: itemSeed.unit,
          updatedAt: initialAt,
        })
        .run();

      tx.insert(stockMovement)
        .values({
          createdAt: initialAt,
          id: `demo-movement-${matterSeed.key}-initial-${itemSeed.key}`,
          itemId: itemId(matterSeed.key, itemSeed.key),
          matterId: matterSeed.id,
          note: "演示数据：新建仓库初始建账",
          operatorName: context.operators.teamadmin.name,
          operatorUserId: context.operators.teamadmin.id,
          quantityDelta: itemSeed.stock,
          refType: "manual",
          stockAfter: itemSeed.stock,
          type: "initial",
        })
        .run();
    }
  }
};

const insertDemoRecords = (tx: Transaction, context: SeedContext) => {
  for (const matterSeed of demoMatters) {
    for (const dayOffset of HISTORY_OFFSETS) {
      const date = shiftDays(today, dayOffset);
      const id = recordId(matterSeed.key, date);
      const acceptedAt = timestampAt(date, "08:10");
      const handoverAt = timestampAt(date, "19:50");
      const consumed = consumptionBefore(matterSeed.key, dayOffset);
      const isEmergency = matterSeed.key === "emergency";

      tx.insert(handoverRecord)
        .values({
          acceptedAt,
          acceptedByName: context.operators.nurse.name,
          acceptedByUserId: context.operators.nurse.id,
          acceptanceNote: isEmergency
            ? "夜班交接：处置室物品按清单核对，纱布差异已上报。"
            : "晨间交接：治疗室物品按清单核对无差异。",
          createdAt: timestampAt(date, "07:55"),
          handoverAt,
          handoverByName: context.operators.teamadmin.name,
          handoverByUserId: context.operators.teamadmin.id,
          handoverNote: isEmergency
            ? "白班结束，交接表已提交，纱布差异待管理员处置。"
            : "治疗室交接表已提交，耗材补充已登记。",
          id,
          matterId: matterSeed.id,
          recordDate: date,
          status: "handover_submitted",
          updatedAt: handoverAt,
        })
        .run();

      for (const itemSeed of matterSeed.items) {
        const expectedQty = itemSeed.stock - (consumed.get(itemSeed.key) ?? 0);

        const isDiff =
          isEmergency && dayOffset === -1 && itemSeed.key === DIFF_ITEM_KEY;

        const actualQty = isDiff ? expectedQty - 2 : expectedQty;

        const note = isDiff
          ? `实盘 ${actualQty} ${itemSeed.unit}，比应有少 2 ${itemSeed.unit}，已上报异常。`
          : null;

        tx.insert(handoverRecordItem)
          .values({
            acceptedAt,
            actualQty,
            checked: true,
            expectedQty,
            handoverActualQty: actualQty,
            handoverChecked: true,
            handoverNote: note,
            id: `${id}-${itemSeed.key}`,
            itemId: itemId(matterSeed.key, itemSeed.key),
            itemName: itemSeed.name,
            itemSpec: itemSeed.spec,
            note,
            recordId: id,
            unit: itemSeed.unit,
          })
          .run();
      }
    }
  }
};

const insertDemoUsages = (
  tx: Transaction,
  context: SeedContext
): Map<string, Date> => {
  const usageCreatedAt = new Map<string, Date>();

  for (const [index, usage] of demoUsages.entries()) {
    const date = shiftDays(today, usage.dayOffset);

    const createdAt = timestampAt(
      date,
      `10:${String(10 + index * 3).padStart(2, "0")}`
    );

    usageCreatedAt.set(usage.id, createdAt);

    const matterSeed = demoMatters.find(
      (matterDefinition) => matterDefinition.key === usage.matterKey
    );

    if (matterSeed === undefined) {
      throw new Error(`演示数据引用了不存在的交接事项 ${usage.matterKey}`);
    }

    const operator = context.operators[usage.operator];

    const linkedRecord =
      usage.dayOffset === -1 || usage.dayOffset === -2
        ? recordId(matterSeed.key, date)
        : null;

    tx.insert(usageRecord)
      .values({
        createdAt,
        id: usage.id,
        matterId: matterSeed.id,
        note: usage.note,
        operatorName: operator.name,
        operatorUserId: operator.id,
        patientName: usage.patientName,
        patientNo: `${usage.patientNoPrefix}${date.replaceAll("-", "")}${String(index + 1).padStart(2, "0")}`,
        patientPhone: usage.patientPhone,
        patientType: usage.patientType,
        recordId: linkedRecord,
        status: usage.status,
        updatedAt: createdAt,
        usedAt: date,
      })
      .run();

    for (const line of usage.lines) {
      const itemSeed = matterSeed.items.find(
        (itemDefinition) => itemDefinition.key === line.itemKey
      );

      if (itemSeed === undefined) {
        throw new Error(
          `演示数据引用了不存在的物品 ${matterSeed.key}/${line.itemKey}`
        );
      }

      tx.insert(usageItem)
        .values({
          id: `demo-usage-item-${usage.id}-${line.itemKey}`,
          itemId: itemId(matterSeed.key, line.itemKey),
          itemName: itemSeed.name,
          itemSpec: itemSeed.spec,
          quantity: line.quantity,
          unit: itemSeed.unit,
          usageId: usage.id,
        })
        .run();
    }
  }

  return usageCreatedAt;
};

const insertDemoMovements = (
  tx: Transaction,
  context: SeedContext,
  usageCreatedAt: Map<string, Date>
) => {
  for (const matterSeed of demoMatters) {
    const running = new Map(
      matterSeed.items.map((itemSeed) => [itemSeed.key, itemSeed.stock])
    );

    const usages = usagesFor(matterSeed.key).toSorted(
      (left, right) => left.dayOffset - right.dayOffset
    );

    for (const usage of usages) {
      const createdAt = usageCreatedAt.get(usage.id);

      if (createdAt === undefined) {
        throw new Error(`演示数据缺少消耗时间 ${usage.id}`);
      }

      const operator = context.operators[usage.operator];

      for (const line of usage.lines) {
        const nextStock = (running.get(line.itemKey) ?? 0) - line.quantity;
        running.set(line.itemKey, nextStock);

        tx.insert(stockMovement)
          .values({
            createdAt,
            id: `demo-movement-${usage.id}-${line.itemKey}`,
            itemId: itemId(matterSeed.key, line.itemKey),
            matterId: matterSeed.id,
            note: `演示数据：${usage.patientName} 用物消耗`,
            operatorName: operator.name,
            operatorUserId: operator.id,
            quantityDelta: -line.quantity,
            refId: usage.id,
            refType: "usage",
            stockAfter: nextStock,
            type: "consumption",
          })
          .run();
      }
    }

    for (const itemSeed of matterSeed.items) {
      const actualStock = running.get(itemSeed.key) ?? 0;
      const expectedStock = finalStock(matterSeed, itemSeed.key);

      if (actualStock !== expectedStock) {
        throw new Error(
          `演示数据库存流水与最终库存不一致：${matterSeed.key}/${itemSeed.key}`
        );
      }
    }
  }
};

const insertDemoAlerts = (tx: Transaction, context: SeedContext) => {
  tx.insert(revokeRequest)
    .values({
      createdAt: timestampAt(today, "14:20"),
      id: "demo-revoke-01",
      reason: "患者取消输液，物品未使用，申请撤销并恢复库存",
      requestedByName: context.operators.nurse.name,
      requestedByUserId: context.operators.nurse.id,
      status: "pending",
      updatedAt: timestampAt(today, "14:20"),
      usageId: "demo-usage-05",
    })
    .run();

  const emergencyMatter = demoMatters.find(
    (matterDefinition) => matterDefinition.key === "emergency"
  );

  if (emergencyMatter === undefined) {
    throw new Error("演示数据缺少急诊处置室");
  }

  const exceptionDate = shiftDays(today, -1);

  tx.insert(exceptionEvent)
    .values({
      createdAt: timestampAt(exceptionDate, "20:05"),
      description:
        "夜班交班核对发现无菌纱布块实盘 88 包，系统应有 90 包，差 2 包，已上报待核查。",
      id: "demo-exception-01",
      itemId: itemId("emergency", DIFF_ITEM_KEY),
      matterId: emergencyMatter.id,
      recordId: recordId("emergency", exceptionDate),
      reportedByName: context.operators.nurse.name,
      reportedByUserId: context.operators.nurse.id,
      severity: "medium",
      status: "open",
      type: "count_mismatch",
      updatedAt: timestampAt(exceptionDate, "20:05"),
    })
    .run();
};

const seed = async () => {
  const teamId = findOrCreateTeam();

  const users = await Promise.all(
    demoUsers.map(async (demoUser) => ({
      ...(await ensureUser(demoUser, teamId)),
      role: demoUser.role,
      username: demoUser.username,
    }))
  );

  const operatorOf = (key: OperatorKey): DemoOperator => {
    const username = key === "teamadmin" ? "teamadmin" : "nurse";
    const operator = users.find((entry) => entry.username === username);

    if (operator === undefined) {
      throw new Error(`演示数据缺少账号 ${username}`);
    }

    return operator;
  };

  const context: SeedContext = {
    operators: {
      nurse: operatorOf("nurse"),
      teamadmin: operatorOf("teamadmin"),
    },
    teamId,
  };

  db.transaction((tx) => {
    removeDemoData(tx, teamId);
    insertDemoMatters(tx, context);
    insertDemoRecords(tx, context);
    const usageCreatedAt = insertDemoUsages(tx, context);
    insertDemoMovements(tx, context, usageCreatedAt);
    insertDemoAlerts(tx, context);
  });

  const matterIds = demoMatters.map((matterSeed) => matterSeed.id);

  return {
    counts: {
      exceptions: db
        .select({ id: exceptionEvent.id })
        .from(exceptionEvent)
        .where(inArray(exceptionEvent.matterId, matterIds))
        .all().length,
      items: db
        .select({ id: item.id })
        .from(item)
        .where(inArray(item.matterId, matterIds))
        .all().length,
      records: db
        .select({ id: handoverRecord.id })
        .from(handoverRecord)
        .where(inArray(handoverRecord.matterId, matterIds))
        .all().length,
      usages: db
        .select({ id: usageRecord.id })
        .from(usageRecord)
        .where(inArray(usageRecord.matterId, matterIds))
        .all().length,
    },
    teamId,
  };
};

try {
  const result = await seed();

  const matterList = demoMatters
    .map(
      (matterSeed) =>
        `  - ${matterSeed.name}（扫码页 /scan/${matterSeed.qrToken}）`
    )
    .join("\n");

  console.log("演示数据已就绪（重复执行会重建演示数据）：\n");
  console.log(`团队：${DEMO_TEAM_NAME}（${DEMO_TEAM_CODE}）`);
  console.log(`交接事项：\n${matterList}`);
  console.log(
    `数据量：物品 ${result.counts.items} 个，交接记录 ${result.counts.records} 条，消耗记录 ${result.counts.usages} 条，异常 ${result.counts.exceptions} 条，待审批撤销 1 条。\n`
  );
  console.log("演示账号：");

  for (const demoUser of demoUsers) {
    console.log(
      `  ${demoUser.username} / ${demoUser.password}（${demoUser.name}）`
    );
  }

  console.log(
    "\n登录地址：http://localhost:5173/login（开发）或部署后的 BETTER_AUTH_URL。"
  );
  console.log(`数据库：${databasePath}`);
} finally {
  db.$client.close();
}
