import { defineRelations } from "drizzle-orm";

import { account, session, user, verification } from "#src/schema/auth.ts";
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
} from "#src/schema/handover.ts";

export const relations = defineRelations(
  {
    account,
    session,
    user,
    verification,
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
  },
  (r) => ({
    account: {
      user: r.one.user({ from: r.account.userId, to: r.user.id }),
    },
    session: {
      user: r.one.user({ from: r.session.userId, to: r.user.id }),
    },
    user: {
      accounts: r.many.account(),
      sessions: r.many.session(),
    },
    team: {
      matters: r.many.matter({ from: r.team.id, to: r.matter.teamId }),
    },
    matter: {
      team: r.one.team({ from: r.matter.teamId, to: r.team.id }),
      items: r.many.item({ from: r.matter.id, to: r.item.matterId }),
      records: r.many.handoverRecord({
        from: r.matter.id,
        to: r.handoverRecord.matterId,
      }),
      usages: r.many.usageRecord({
        from: r.matter.id,
        to: r.usageRecord.matterId,
      }),
      movements: r.many.stockMovement({
        from: r.matter.id,
        to: r.stockMovement.matterId,
      }),
      exceptions: r.many.exceptionEvent({
        from: r.matter.id,
        to: r.exceptionEvent.matterId,
      }),
    },
    item: {
      matter: r.one.matter({ from: r.item.matterId, to: r.matter.id }),
      recordItems: r.many.handoverRecordItem({
        from: r.item.id,
        to: r.handoverRecordItem.itemId,
      }),
      usageItems: r.many.usageItem({ from: r.item.id, to: r.usageItem.itemId }),
      movements: r.many.stockMovement({
        from: r.item.id,
        to: r.stockMovement.itemId,
      }),
    },
    handoverRecord: {
      matter: r.one.matter({
        from: r.handoverRecord.matterId,
        to: r.matter.id,
      }),
      items: r.many.handoverRecordItem({
        from: r.handoverRecord.id,
        to: r.handoverRecordItem.recordId,
      }),
      usages: r.many.usageRecord({
        from: r.handoverRecord.id,
        to: r.usageRecord.recordId,
      }),
      exceptions: r.many.exceptionEvent({
        from: r.handoverRecord.id,
        to: r.exceptionEvent.recordId,
      }),
    },
    handoverRecordItem: {
      record: r.one.handoverRecord({
        from: r.handoverRecordItem.recordId,
        to: r.handoverRecord.id,
      }),
      item: r.one.item({ from: r.handoverRecordItem.itemId, to: r.item.id }),
    },
    usageRecord: {
      matter: r.one.matter({ from: r.usageRecord.matterId, to: r.matter.id }),
      record: r.one.handoverRecord({
        from: r.usageRecord.recordId,
        to: r.handoverRecord.id,
      }),
      items: r.many.usageItem({
        from: r.usageRecord.id,
        to: r.usageItem.usageId,
      }),
      revokeRequests: r.many.revokeRequest({
        from: r.usageRecord.id,
        to: r.revokeRequest.usageId,
      }),
    },
    usageItem: {
      usage: r.one.usageRecord({
        from: r.usageItem.usageId,
        to: r.usageRecord.id,
      }),
      item: r.one.item({ from: r.usageItem.itemId, to: r.item.id }),
    },
    revokeRequest: {
      usage: r.one.usageRecord({
        from: r.revokeRequest.usageId,
        to: r.usageRecord.id,
      }),
    },
    exceptionEvent: {
      matter: r.one.matter({
        from: r.exceptionEvent.matterId,
        to: r.matter.id,
      }),
      record: r.one.handoverRecord({
        from: r.exceptionEvent.recordId,
        to: r.handoverRecord.id,
      }),
      item: r.one.item({ from: r.exceptionEvent.itemId, to: r.item.id }),
    },
  })
);
