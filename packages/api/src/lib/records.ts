import { randomUUID } from "node:crypto";

import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";

import type { Database } from "@handoverkit/db";
import {
  handoverRecord,
  handoverRecordItem,
  item,
} from "@handoverkit/db/schema/handover";

type RecordRow = typeof handoverRecord.$inferSelect;

const findRecord = (
  db: Database,
  matterId: string,
  recordDate: string
): RecordRow | undefined =>
  db
    .select()
    .from(handoverRecord)
    .where(
      and(
        eq(handoverRecord.matterId, matterId),
        eq(handoverRecord.recordDate, recordDate)
      )
    )
    .all()[0];

/**
 * 读取或创建“交接事项 + 日期”的唯一交接记录。
 * 清单快照取创建时仍启用的物品及其当前库存；并发唯一冲突时回退为读取已创建记录。
 */
export const ensureRecord = (
  db: Database,
  matterId: string,
  recordDate: string
): RecordRow => {
  const existing = findRecord(db, matterId, recordDate);

  if (existing !== undefined) {
    return existing;
  }

  const recordId = randomUUID();

  try {
    db.transaction((tx) => {
      tx.insert(handoverRecord)
        .values({ id: recordId, matterId, recordDate })
        .run();

      const items = tx
        .select()
        .from(item)
        .where(and(eq(item.matterId, matterId), eq(item.status, "active")))
        .orderBy(item.createdAt)
        .all();

      if (items.length > 0) {
        tx.insert(handoverRecordItem)
          .values(
            items.map((row) => ({
              expectedQty: row.stock,
              id: randomUUID(),
              itemId: row.id,
              itemName: row.name,
              itemSpec: row.spec,
              recordId,
              unit: row.unit,
            }))
          )
          .run();
      }
    });
  } catch (error) {
    const raced = findRecord(db, matterId, recordDate);

    if (raced !== undefined) {
      return raced;
    }

    throw error instanceof Error
      ? error
      : new Error("交接记录创建失败，请重试", { cause: error });
  }

  const created = findRecord(db, matterId, recordDate);

  if (created === undefined) {
    throw new ORPCError("CONFLICT", { message: "交接记录创建失败，请重试" });
  }

  return created;
};
