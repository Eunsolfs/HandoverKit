import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  ClipboardCheckIcon,
  FileCheck2Icon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@handoverkit/ui/components/alert";
import { Button } from "@handoverkit/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@handoverkit/ui/components/card";

import { AppLink } from "#src/components/app/app-link.tsx";
import { ChecklistDialog } from "#src/components/app/checklist-dialog.tsx";
import { ConfirmDialog } from "#src/components/app/confirm-dialog.tsx";
import { DataTable } from "#src/components/app/data-table.tsx";
import type { DataTableColumn } from "#src/components/app/data-table.tsx";
import { EmptyState } from "#src/components/app/empty-state.tsx";
import { ErrorState } from "#src/components/app/error-state.tsx";
import { PageSkeleton } from "#src/components/app/loading.tsx";
import { PageHeader } from "#src/components/app/page-header.tsx";
import { StatusBadge } from "#src/components/app/status-badge.tsx";
import { api } from "#src/lib/api.ts";
import { formatDateTime, formatRecordDate } from "#src/lib/format.ts";
import { PATIENT_TYPE_LABELS } from "#src/lib/types.ts";
import type { RecordItemDto } from "#src/lib/types.ts";

const itemSummary = (items: { itemName: string; quantity: number }[]) =>
  items.map((item) => `${item.itemName} × ${item.quantity}`).join("、");

const ITEM_COLUMNS: DataTableColumn<RecordItemDto>[] = [
  {
    cell: (item) => (
      <div className="grid gap-0.5">
        <span className="font-medium">{item.itemName}</span>
        <span className="text-muted-foreground text-xs">
          {item.itemSpec ?? "—"}
        </span>
      </div>
    ),
    header: "物品",
    key: "name",
  },
  {
    align: "right",
    cell: (item) => (
      <span className="tabular-nums">
        {item.expectedQty} {item.unit}
      </span>
    ),
    header: "应有",
    key: "expected",
  },
  {
    align: "right",
    cell: (item) =>
      item.actualQty === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span className="tabular-nums">
          {item.actualQty} {item.unit}
        </span>
      ),
    header: "实盘",
    key: "actual",
  },
  {
    cell: (item) =>
      item.checked ? (
        <span className="text-success text-xs font-medium">已核对</span>
      ) : (
        <span className="text-muted-foreground text-xs">未核对</span>
      ),
    header: "核对",
    key: "checked",
  },
  {
    align: "right",
    cell: (item) =>
      item.handoverActualQty === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span className="tabular-nums">{item.handoverActualQty}</span>
      ),
    header: "交班实盘",
    key: "handover-actual",
  },
  {
    cell: (item) =>
      item.handoverChecked ? (
        <span className="text-success text-xs font-medium">已核对</span>
      ) : (
        <span className="text-muted-foreground text-xs">未核对</span>
      ),
    header: "交班核对",
    key: "handover-checked",
  },
  {
    cell: (item) =>
      item.handoverNote ??
      item.note ?? <span className="text-muted-foreground">—</span>,
    header: "备注",
    key: "note",
  },
];

const RecordDetailPage = () => {
  const { recordId } = Route.useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<"accept" | "handover" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const recordQuery = useQuery(
    api.records.get.queryOptions({ input: { id: recordId } })
  );

  const invalidateRecords = async () => {
    await queryClient.invalidateQueries({ queryKey: api.records.key() });
  };

  const acceptMutation = useMutation({
    ...api.records.accept.mutationOptions(),
    onSuccess: () => {
      toast.success("已完成接班核对");
      setDialog(null);
      void invalidateRecords();
    },
  });

  const handoverMutation = useMutation({
    ...api.records.submitHandover.mutationOptions(),
    onSuccess: () => {
      toast.success("交班表已提交");
      setDialog(null);
      void invalidateRecords();
    },
  });

  const deleteMutation = useMutation({
    ...api.records.remove.mutationOptions(),
    onSuccess: async () => {
      toast.success("交接记录已删除");
      setDeleteOpen(false);
      await invalidateRecords();
      await router.navigate({ href: "/records" });
    },
  });

  if (recordQuery.isPending) {
    return <PageSkeleton />;
  }

  if (recordQuery.isError) {
    return (
      <ErrorState
        error={recordQuery.error}
        onRetry={() => {
          void recordQuery.refetch();
        }}
      />
    );
  }

  const record = recordQuery.data;

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <AppLink
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex min-h-11 w-fit items-center gap-1 rounded-md px-1 text-xs focus-visible:ring-2 focus-visible:outline-none lg:min-h-0 lg:px-0"
          href="/records"
        >
          <ArrowLeftIcon className="size-3.5" />
          返回交接记录
        </AppLink>
        {record.permissions.requiresExceptionReport ? (
          <Alert>
            <ShieldAlertIcon />
            <AlertTitle>接班核对存在数量差异，尚未异常上报</AlertTitle>
            <AlertDescription>
              请到该事项的扫码页切换到「用物登记」提交异常上报；上报后才能登记用物消耗。
            </AlertDescription>
          </Alert>
        ) : null}
        <PageHeader
          actions={
            <>
              <StatusBadge status={record.status} />
              {record.permissions.canAccept ? (
                <Button
                  onClick={() => {
                    setDialog("accept");
                  }}
                  size="sm"
                >
                  <ClipboardCheckIcon />
                  接班核对
                </Button>
              ) : null}
              {record.permissions.canHandover ? (
                <Button
                  onClick={() => {
                    setDialog("handover");
                  }}
                  size="sm"
                >
                  <FileCheck2Icon />
                  提交交班表
                </Button>
              ) : null}
              {record.permissions.canDelete ? (
                <Button
                  onClick={() => {
                    setDeleteOpen(true);
                  }}
                  size="sm"
                  variant="outline"
                >
                  <Trash2Icon />
                  删除记录
                </Button>
              ) : null}
            </>
          }
          description={`${record.matterName} · ${formatRecordDate(record.recordDate)} · 清单 ${record.itemCount} 项 · 差异 ${record.diffCount} 项`}
          title="交接记录详情"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>物品清单</CardTitle>
            <CardDescription>
              逐项核对状态与实盘数量；差异会生成异常事件
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="hidden md:block">
              <DataTable
                columns={ITEM_COLUMNS}
                getRowKey={(item) => item.itemId}
                rows={record.items}
              />
            </div>
            <ul className="grid gap-2 md:hidden">
              {record.items.map((item) => {
                const note = item.handoverNote ?? item.note;

                return (
                  <li className="rounded-lg border p-3" key={item.itemId}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm leading-snug font-medium break-words">
                          {item.itemName}
                        </p>
                        <p className="text-muted-foreground text-xs break-words">
                          {item.itemSpec ?? "无规格"} · 单位 {item.unit}
                        </p>
                      </div>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {item.checked || item.handoverChecked
                          ? "已核对"
                          : "未核对"}
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">应有</dt>
                        <dd className="tabular-nums">
                          {item.expectedQty} {item.unit}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">实盘</dt>
                        <dd className="tabular-nums">
                          {item.actualQty === null
                            ? "—"
                            : `${item.actualQty} ${item.unit}`}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">接班核对</dt>
                        <dd
                          className={
                            item.checked
                              ? "text-success font-medium"
                              : "text-muted-foreground"
                          }
                        >
                          {item.checked ? "已核对" : "未核对"}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-muted-foreground">交班核对</dt>
                        <dd
                          className={
                            item.handoverChecked
                              ? "text-success font-medium"
                              : "text-muted-foreground"
                          }
                        >
                          {item.handoverChecked ? "已核对" : "未核对"}
                        </dd>
                      </div>
                      {item.handoverActualQty === null ? null : (
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-muted-foreground">交班实盘</dt>
                          <dd className="tabular-nums">
                            {item.handoverActualQty} {item.unit}
                          </dd>
                        </div>
                      )}
                    </dl>
                    {note === null || note.length === 0 ? null : (
                      <p className="text-muted-foreground mt-2 text-xs break-words">
                        备注：{note}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>接班验收</CardTitle>
            </CardHeader>
            <CardContent>
              {record.acceptedByName === null ? (
                <p className="text-muted-foreground text-sm">尚未确认接收</p>
              ) : (
                <dl className="grid gap-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">接收人</dt>
                    <dd>{record.acceptedByName}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">接收时间</dt>
                    <dd>{formatDateTime(record.acceptedAt)}</dd>
                  </div>
                  {record.acceptanceNote === null ? null : (
                    <div className="grid gap-1">
                      <dt className="text-muted-foreground">备注</dt>
                      <dd className="text-sm">{record.acceptanceNote}</dd>
                    </div>
                  )}
                </dl>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>交班信息</CardTitle>
            </CardHeader>
            <CardContent>
              {record.handoverByName === null ? (
                <p className="text-muted-foreground text-sm">尚未提交交班表</p>
              ) : (
                <dl className="grid gap-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">交班人</dt>
                    <dd>{record.handoverByName}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">交班时间</dt>
                    <dd>{formatDateTime(record.handoverAt)}</dd>
                  </div>
                  {record.handoverNote === null ? null : (
                    <div className="grid gap-1">
                      <dt className="text-muted-foreground">备注</dt>
                      <dd className="text-sm">{record.handoverNote}</dd>
                    </div>
                  )}
                </dl>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>异常事件</CardTitle>
              <CardDescription>
                共 {record.exceptions.length} 条
              </CardDescription>
            </CardHeader>
            <CardContent>
              {record.exceptions.length === 0 ? (
                <p className="text-muted-foreground text-sm">暂无异常</p>
              ) : (
                <ul className="grid gap-2">
                  {record.exceptions.map((exception) => (
                    <li className="grid gap-1 text-sm" key={exception.id}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 font-medium break-words">
                          {exception.description}
                        </span>
                        <StatusBadge status={exception.status} />
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {exception.reportedByName} ·{" "}
                        {formatDateTime(exception.reportedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>撤销申请</CardTitle>
              <CardDescription>
                共 {record.revokeRequests.length} 条
              </CardDescription>
            </CardHeader>
            <CardContent>
              {record.revokeRequests.length === 0 ? (
                <p className="text-muted-foreground text-sm">暂无撤销申请</p>
              ) : (
                <ul className="grid gap-2">
                  {record.revokeRequests.map((request) => (
                    <li className="grid gap-1 text-sm" key={request.id}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 break-words">
                          {request.reason}
                        </span>
                        <StatusBadge status={request.status} />
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {request.requestedByName} ·{" "}
                        {formatDateTime(request.requestedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>当日消耗</CardTitle>
          <CardDescription>共 {record.usages.length} 条</CardDescription>
        </CardHeader>
        <CardContent>
          {record.usages.length === 0 ? (
            <EmptyState
              description="该记录当天还没有用物消耗登记。"
              icon={ShieldAlertIcon}
              title="暂无消耗记录"
            />
          ) : (
            <ul className="divide-y">
              {record.usages.map((usage) => (
                <li
                  className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                  key={usage.id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium break-words">
                      {usage.patientName}（
                      {PATIENT_TYPE_LABELS[usage.patientType]} ·{" "}
                      {usage.patientNo}）
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {itemSummary(usage.items)} · 操作员 {usage.operatorName}
                    </p>
                  </div>
                  <StatusBadge status={usage.status} />
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {formatDateTime(usage.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {dialog === "accept" ? (
        <ChecklistDialog
          confirmLabel="确认接收"
          description="请逐项核对；实盘与应有数量不一致时必须填写备注，并需在扫码页提交异常上报后才能登记用物。"
          items={record.items}
          onOpenChange={(open) => {
            if (!open) {
              setDialog(null);
            }
          }}
          onSubmit={(payload, note) => {
            acceptMutation.mutate({ id: record.id, items: payload, note });
          }}
          pending={acceptMutation.isPending}
          title="接班核对"
        />
      ) : null}

      {dialog === "handover" ? (
        <ChecklistDialog
          confirmLabel="提交交班表"
          description="交班前请再次核对清单；差异必须填写备注。"
          items={record.items}
          onOpenChange={(open) => {
            if (!open) {
              setDialog(null);
            }
          }}
          onSubmit={(payload, note) => {
            handoverMutation.mutate({ id: record.id, items: payload, note });
          }}
          pending={handoverMutation.isPending}
          title="提交交班表"
        />
      ) : null}

      <ConfirmDialog
        confirmLabel="删除记录"
        description="仅无消耗记录时可删除；删除后不可恢复。"
        destructive
        onConfirm={() => {
          deleteMutation.mutate({ id: record.id });
        }}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        pending={deleteMutation.isPending}
        title="删除这条交接记录？"
      />
    </div>
  );
};

export const Route = createFileRoute("/_app/records/$recordId")({
  component: RecordDetailPage,
});
