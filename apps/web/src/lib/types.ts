import type { AppRouterClient } from "@handoverkit/api";

/**
 * 前端只从 oRPC 客户端类型推导 DTO，避免手写重复契约。
 * AppRouterClient 的每个 procedure 都是可调用函数，ReturnType 即输出类型。
 */
export type MatterDto = Awaited<
  ReturnType<AppRouterClient["matters"]["list"]>
>[number];

export type MatterByTokenDto = Awaited<
  ReturnType<AppRouterClient["matters"]["byToken"]>
>;

export type RecordSummaryDto = Awaited<
  ReturnType<AppRouterClient["records"]["list"]>
>["items"][number];

export type RecordDetailDto = Awaited<
  ReturnType<AppRouterClient["records"]["get"]>
>;

export type RecordItemDto = RecordDetailDto["items"][number];

export type UsageDto = Awaited<
  ReturnType<AppRouterClient["usage"]["list"]>
>["items"][number];

export type RecordStatusDto = RecordDetailDto["status"];

export type UsageStatusDto = UsageDto["status"];

export type RecordPeriod = "day" | "week" | "month" | "year";

export const RECORD_STATUS_OPTIONS: {
  label: string;
  value: RecordStatusDto;
}[] = [
  { label: "待接收", value: "pending_acceptance" },
  { label: "已接收", value: "accepted" },
  { label: "已交班", value: "handover_submitted" },
];

export const USAGE_STATUS_OPTIONS: { label: string; value: UsageStatusDto }[] =
  [
    { label: "已生效", value: "active" },
    { label: "撤销待审批", value: "revoke_pending" },
    { label: "已撤销", value: "revoked" },
  ];

export const PATIENT_TYPE_LABELS = {
  inpatient: "住院",
  outpatient: "门诊",
} as const;
