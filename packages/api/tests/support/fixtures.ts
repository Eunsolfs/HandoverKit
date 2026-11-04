import { randomUUID } from "node:crypto";

import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";

import type { Database } from "@handoverkit/db";
import {
  item,
  matter,
  subWarehouse,
  team,
} from "@handoverkit/db/schema/handover";

let sequence = 0;

const nextSequence = () => {
  sequence += 1;

  return sequence;
};

export interface CapturedOrpcError {
  code: string;
  message: string;
}

/** 断言调用失败并返回 oRPC 错误码/消息；调用成功时抛错。 */
export const captureOrpcError = async (
  call: Promise<unknown>
): Promise<CapturedOrpcError> => {
  try {
    await call;
  } catch (error) {
    if (error instanceof ORPCError) {
      return { code: String(error.code), message: error.message };
    }

    throw error;
  }

  throw new Error("期望调用失败，但调用成功");
};

export const createTeamFixture = (
  db: Database,
  overrides: Partial<typeof team.$inferInsert> = {}
) => {
  const index = nextSequence();

  const [row] = db
    .insert(team)
    .values({
      code: `TEAM-${index}`,
      name: `测试团队${index}`,
      ...overrides,
    })
    .returning()
    .all();

  if (row === undefined) {
    throw new Error("团队创建失败");
  }

  return row;
};

export const createMatterFixture = (
  db: Database,
  teamId: string,
  overrides: Partial<typeof matter.$inferInsert> = {}
) => {
  const index = nextSequence();

  const [row] = db
    .insert(matter)
    .values({
      id: randomUUID(),
      name: `交接事项${index}`,
      qrToken: `tok-${randomUUID().replaceAll("-", "")}`,
      teamId,
      ...overrides,
    })
    .returning()
    .all();

  if (row === undefined) {
    throw new Error("交接事项创建失败");
  }

  db.insert(subWarehouse)
    .values({
      id: randomUUID(),
      matterId: row.id,
      name: "主仓库",
      sortOrder: 0,
    })
    .run();

  return row;
};

export const createItemFixture = (
  db: Database,
  matterId: string,
  overrides: Partial<typeof item.$inferInsert> = {}
) => {
  const index = nextSequence();

  const [warehouse] = db
    .select({ id: subWarehouse.id })
    .from(subWarehouse)
    .where(eq(subWarehouse.matterId, matterId))
    .limit(1)
    .all();

  const subWarehouseId = overrides.subWarehouseId ?? warehouse?.id;

  if (subWarehouseId === undefined) {
    throw new Error("交接事项缺少子仓库");
  }

  const [row] = db
    .insert(item)
    .values({
      id: randomUUID(),
      matterId,
      name: `物品${index}`,
      stock: 10,
      subWarehouseId,
      unit: "个",
      ...overrides,
    })
    .returning()
    .all();

  if (row === undefined) {
    throw new Error("物品创建失败");
  }

  return row;
};
