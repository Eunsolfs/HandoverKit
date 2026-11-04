import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { HistoryIcon, PlusIcon, RotateCcwIcon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@handoverkit/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@handoverkit/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@handoverkit/ui/components/select";
import { Textarea } from "@handoverkit/ui/components/textarea";

import {
  DataTable,
  DataTablePagination,
} from "#src/components/app/data-table.tsx";
import type { DataTableColumn } from "#src/components/app/data-table.tsx";
import { DateRangeFilter } from "#src/components/app/date-range-filter.tsx";
import type { DateRangeValue } from "#src/components/app/date-range-filter.tsx";
import { EmptyState } from "#src/components/app/empty-state.tsx";
import { FormField } from "#src/components/app/form-field.tsx";
import { PageHeader } from "#src/components/app/page-header.tsx";
import { StatusBadge } from "#src/components/app/status-badge.tsx";
import { UsageEntryForm } from "#src/components/app/usage-entry-form.tsx";
import type { UsageEntryValue } from "#src/components/app/usage-entry-form.tsx";
import { useActiveTeam } from "#src/lib/active-team.tsx";
import { api } from "#src/lib/api.ts";
import { formatRecordDate, toLocalDateString } from "#src/lib/format.ts";
import { useMe } from "#src/lib/me.ts";
import { PATIENT_TYPE_LABELS, USAGE_STATUS_OPTIONS } from "#src/lib/types.ts";
import type { MatterDto, UsageDto, UsageStatusDto } from "#src/lib/types.ts";

const ALL_MATTERS = "all";
const ALL_STATUS = "all";

const monthRange = (): DateRangeValue => {
  const now = new Date();

  return {
    from: toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toLocalDateString(now),
  };
};

const usageSummary = (usage: UsageDto): string =>
  usage.items
    .map((item) => {
      const source =
        item.sourceSubWarehouseName === usage.subWarehouseName
          ? ""
          : `（${item.sourceSubWarehouseName}）`;

      return `${item.itemName}${source} × ${item.quantity} ${item.unit}`;
    })
    .join("、");

interface UsageActionsProps {
  usage: UsageDto;
  onRevoke: (usage: UsageDto) => void;
}

const UsageActions = ({ onRevoke, usage }: UsageActionsProps) => {
  if (usage.status === "active") {
    return (
      <Button
        onClick={() => {
          onRevoke(usage);
        }}
        size="xs"
        variant="outline"
      >
        <RotateCcwIcon />
        申请撤销
      </Button>
    );
  }

  if (usage.status === "revoke_pending") {
    return <span className="text-muted-foreground text-xs">审批中</span>;
  }

  return <span className="text-muted-foreground text-xs">已撤销</span>;
};

const buildUsageColumns = (
  onRevoke: (usage: UsageDto) => void
): DataTableColumn<UsageDto>[] => [
  {
    cell: (usage) => (
      <div className="grid gap-0.5">
        <span className="tabular-nums">
          {formatRecordDate(usage.usedAt)}
          {usage.usedAtTime === null ? "" : ` ${usage.usedAtTime}`}
        </span>
        <span className="text-muted-foreground text-xs">
          {usage.subWarehouseName}
          {usage.isBackfill ? " · 补录" : ""}
        </span>
      </div>
    ),
    header: "使用日期 / 子仓库",
    key: "usedAt",
  },
  {
    cell: (usage) => (
      <div className="grid gap-0.5">
        <span className="font-medium">{usage.patientName}</span>
        <span className="text-muted-foreground text-xs">
          {PATIENT_TYPE_LABELS[usage.patientType]} · {usage.patientNo}
        </span>
      </div>
    ),
    header: "患者",
    key: "patient",
  },
  {
    cell: (usage) => usage.operatorName,
    header: "操作员",
    key: "operator",
  },
  {
    cell: (usage) => <span className="text-xs">{usageSummary(usage)}</span>,
    header: "物品明细",
    key: "items",
  },
  {
    align: "right",
    cell: (usage) => (
      <span className="tabular-nums">{usage.totalQuantity}</span>
    ),
    header: "合计",
    key: "total",
  },
  {
    cell: (usage) => <StatusBadge status={usage.status} />,
    header: "状态",
    key: "status",
  },
  {
    align: "right",
    cell: (usage) => <UsageActions onRevoke={onRevoke} usage={usage} />,
    header: "操作",
    key: "actions",
  },
];

interface UsageCreateDialogProps {
  matters: MatterDto[];
  defaultMatterId: string | null;
  mode: "normal" | "backfill";
  operatorName: string;
  onClose: () => void;
}

// eslint-disable-next-line complexity
const UsageCreateDialog = ({
  defaultMatterId,
  matters,
  mode,
  onClose,
  operatorName,
}: UsageCreateDialogProps) => {
  const queryClient = useQueryClient();
  const isBackfill = mode === "backfill";

  const [matterId, setMatterId] = useState(
    defaultMatterId ?? matters[0]?.id ?? ""
  );

  const [subWarehouseId, setSubWarehouseId] = useState("");

  const warehousesQuery = useQuery({
    ...api.subWarehouses.list.queryOptions({ input: { matterId } }),
    enabled: matterId.length > 0,
  });

  const itemsQuery = useQuery({
    ...api.items.list.queryOptions({ input: { matterId } }),
    enabled: matterId.length > 0,
  });

  const createMutation = useMutation({
    ...api.usage.create.mutationOptions(),
    onSuccess: () => {
      toast.success("用物登记成功，库存已扣减");
      void queryClient.invalidateQueries();
      onClose();
    },
  });

  const backfillMutation = useMutation({
    ...api.usage.backfill.mutationOptions(),
    onSuccess: () => {
      toast.success("补登记成功，库存已扣减");
      void queryClient.invalidateQueries();
      onClose();
    },
  });

  const matterOptions = matters.map((matter) => ({
    label: matter.name,
    value: matter.id,
  }));

  const warehouses = warehousesQuery.data ?? [];

  const selectedWarehouseId =
    subWarehouseId.length > 0 ? subWarehouseId : (warehouses[0]?.id ?? "");

  const handleSubmit = (value: UsageEntryValue) => {
    const base = {
      items: value.items,
      matterId,
      note: value.note,
      operatorName: value.operatorName,
      patientName: value.patientName,
      patientNo: value.patientNo,
      patientPhone: value.patientPhone,
      patientType: value.patientType,
      subWarehouseId: selectedWarehouseId,
      usedAt: value.usedAt,
    };

    if (isBackfill) {
      backfillMutation.mutate({
        ...base,
        backfillReason: value.backfillReason ?? "",
        usedTime: value.usedTime ?? "",
      });

      return;
    }

    createMutation.mutate(base);
  };

  const items = itemsQuery.data ?? [];

  const pending = isBackfill
    ? backfillMutation.isPending
    : createMutation.isPending;

  const error = isBackfill ? backfillMutation.error : createMutation.error;

  let itemsSection: ReactNode;

  if (warehousesQuery.isPending || itemsQuery.isPending) {
    itemsSection = <p className="text-muted-foreground text-sm">物品加载中…</p>;
  } else if (warehousesQuery.isError || itemsQuery.isError) {
    itemsSection = (
      <p className="text-destructive text-sm" role="alert">
        {(warehousesQuery.error ?? itemsQuery.error)?.message}
      </p>
    );
  } else if (warehouses.length === 0) {
    itemsSection = (
      <EmptyState
        description="请先在事项二维码页为交接事项创建子仓库。"
        title="没有可用子仓库"
      />
    );
  } else if (items.length === 0) {
    itemsSection = (
      <EmptyState
        description="该交接事项还没有物品，请先在物品库存中添加。"
        title="没有可用物品"
      />
    );
  } else {
    itemsSection = (
      <UsageEntryForm
        defaultOperatorName={operatorName}
        items={items}
        mode={mode}
        onSubmit={handleSubmit}
        pending={pending}
        submitLabel={isBackfill ? "提交补登记" : "提交登记"}
      />
    );
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isBackfill ? "用物补登记" : "用物消耗登记"}
          </DialogTitle>
          <DialogDescription>
            {isBackfill
              ? "补登记不受接班门禁限制，但必须填写使用时间、数量和补录原因；提交后立即扣减对应子仓库库存。"
              : "登记日期必须已完成该子仓库的接班核对并确认接收；如接班数量有差异，需先提交异常上报。物品可跨子仓库选择（会扣减来源子仓库库存）。"}
          </DialogDescription>
        </DialogHeader>

        {matters.length === 0 ? (
          <EmptyState
            description="请先在物品库存中为当前团队创建交接事项与物品。"
            title="还没有可用的交接事项"
          />
        ) : (
          <div className="flex flex-col gap-4">
            <FormField id="usage-matter" label="交接事项" required>
              {(field) => (
                <Select
                  disabled={pending}
                  items={matterOptions}
                  onValueChange={(value: string | null) => {
                    if (value === null) {
                      return;
                    }

                    setMatterId(value);
                    setSubWarehouseId("");
                  }}
                  value={matterId}
                >
                  <SelectTrigger className="w-full" id={field.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {matterOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>

            <FormField
              hint={
                isBackfill
                  ? "补录记到该子仓库名下；物品可从其他子仓库借取"
                  : "当前班次所在子仓库，交接与消耗按它统计"
              }
              id="usage-sub-warehouse"
              label="使用子仓库"
              required
            >
              {(field) => (
                <Select
                  disabled={pending || warehouses.length === 0}
                  items={warehouses.map((warehouse) => ({
                    label: `${warehouse.name}（${warehouse.itemCount} 种）`,
                    value: warehouse.id,
                  }))}
                  onValueChange={(value: string | null) => {
                    if (value === null) {
                      return;
                    }

                    setSubWarehouseId(value);
                  }}
                  value={selectedWarehouseId}
                >
                  <SelectTrigger className="w-full" id={field.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}（{warehouse.itemCount} 种）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>

            {itemsSection}
            {error === null ? null : (
              <p className="text-destructive text-sm" role="alert">
                {error.message}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

interface RevokeDialogProps {
  usage: UsageDto;
  onClose: () => void;
}

const RevokeDialog = ({ onClose, usage }: RevokeDialogProps) => {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const revokeMutation = useMutation({
    ...api.usage.requestRevoke.mutationOptions(),
    onSuccess: () => {
      toast.success("撤销申请已提交，等待管理员审批");
      void queryClient.invalidateQueries();
      onClose();
    },
  });

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>申请撤销用物记录</DialogTitle>
          <DialogDescription>
            {usage.patientName} · {usageSummary(usage)}
          </DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">
          撤销需要管理员审批，通过后库存自动恢复。
        </p>
        <FormField
          error={error ?? undefined}
          id="revoke-reason"
          label="撤销原因"
          required
        >
          {(field) => (
            <Textarea
              {...field}
              disabled={revokeMutation.isPending}
              maxLength={300}
              onChange={(event) => {
                setReason(event.target.value);
              }}
              placeholder="请说明撤销原因（必填）"
              value={reason}
            />
          )}
        </FormField>
        <DialogFooter>
          <Button
            disabled={revokeMutation.isPending}
            onClick={onClose}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={revokeMutation.isPending}
            onClick={() => {
              if (reason.trim().length === 0) {
                setError("请填写撤销原因");

                return;
              }

              setError(null);
              revokeMutation.mutate({ id: usage.id, reason: reason.trim() });
            }}
            type="button"
            variant="destructive"
          >
            {revokeMutation.isPending ? "提交中…" : "提交申请"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const UsagePage = () => {
  const { activeTeamId } = useActiveTeam();
  const me = useMe(activeTeamId);
  const queryClient = useQueryClient();
  const [range, setRange] = useState<DateRangeValue>(monthRange);
  const [matterId, setMatterId] = useState("");

  const [status, setStatus] = useState<UsageStatusDto | typeof ALL_STATUS>(
    ALL_STATUS
  );

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [createMode, setCreateMode] = useState<"normal" | "backfill" | null>(
    null
  );

  const [revokeTarget, setRevokeTarget] = useState<UsageDto | null>(null);

  const mattersQuery = useQuery({
    ...api.matters.list.queryOptions({
      input: { teamId: activeTeamId ?? undefined },
    }),
    enabled: activeTeamId !== null,
  });

  const usageQuery = useQuery({
    ...api.usage.list.queryOptions({
      input: {
        from: range.from,
        matterId: matterId.length === 0 ? undefined : matterId,
        page,
        pageSize,
        status: status === ALL_STATUS ? undefined : status,
        teamId: activeTeamId ?? undefined,
        to: range.to,
      },
    }),
    enabled: activeTeamId !== null,
  });

  if (activeTeamId === null) {
    return (
      <div className="grid gap-6">
        <PageHeader title="用物消耗" />
        <EmptyState
          description="超级管理员需要先创建团队并选择当前团队。"
          title="还没有可用团队"
        />
      </div>
    );
  }

  const matters = mattersQuery.data ?? [];

  const matterOptions = [
    { label: "全部交接事项", value: ALL_MATTERS },
    ...matters.map((matter) => ({ label: matter.name, value: matter.id })),
  ];

  const statusOptions = [
    { label: "全部状态", value: ALL_STATUS },
    ...USAGE_STATUS_OPTIONS,
  ];

  const result = usageQuery.data;
  const columns = buildUsageColumns(setRevokeTarget);

  return (
    <div className="grid gap-6">
      <PageHeader
        actions={
          <div className="flex gap-2">
            <Button
              disabled={matters.length === 0}
              onClick={() => {
                setCreateMode("normal");
              }}
              size="sm"
            >
              <PlusIcon />
              登记用物
            </Button>
            <Button
              disabled={matters.length === 0}
              onClick={() => {
                setCreateMode("backfill");
              }}
              size="sm"
              variant="outline"
            >
              <HistoryIcon />
              补登记
            </Button>
          </div>
        }
        description="登记患者用物消耗；撤销需管理员审批，通过后自动恢复库存"
        title="用物消耗"
      />

      <div className="flex flex-wrap items-end gap-2">
        <DateRangeFilter
          onChange={(next) => {
            setRange(next);
            setPage(1);
          }}
          value={range}
        />
        <Select
          items={matterOptions}
          onValueChange={(value: string | null) => {
            if (value === null) {
              return;
            }

            setMatterId(value === ALL_MATTERS ? "" : value);
            setPage(1);
          }}
          value={matterId.length === 0 ? ALL_MATTERS : matterId}
        >
          <SelectTrigger aria-label="按交接事项筛选">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {matterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={statusOptions}
          onValueChange={(value: string | null) => {
            if (value === null) {
              return;
            }

            if (value === ALL_STATUS) {
              setStatus(ALL_STATUS);
              setPage(1);

              return;
            }

            const next = USAGE_STATUS_OPTIONS.find(
              (option) => option.value === value
            );

            if (next !== undefined) {
              setStatus(next.value);
              setPage(1);
            }
          }}
          value={status}
        >
          <SelectTrigger aria-label="按状态筛选">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        empty={
          <EmptyState
            description="调整日期范围或筛选条件后再试。"
            title="没有符合条件的用物记录"
          />
        }
        error={usageQuery.error ?? undefined}
        getRowKey={(usage) => usage.id}
        loading={usageQuery.isPending}
        onRetry={() => {
          void usageQuery.refetch();
        }}
        rows={result?.items ?? []}
      />

      {result === undefined ? null : (
        <DataTablePagination
          disabled={usageQuery.isFetching}
          onPageChange={setPage}
          onPageSizeChange={(next) => {
            setPageSize(next);
            setPage(1);
          }}
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
        />
      )}

      {createMode === null ? null : (
        <UsageCreateDialog
          defaultMatterId={matterId.length === 0 ? null : matterId}
          matters={matters}
          mode={createMode}
          onClose={() => {
            setCreateMode(null);
            void queryClient.invalidateQueries();
          }}
          operatorName={me.data?.user.name ?? ""}
        />
      )}

      {revokeTarget === null ? null : (
        <RevokeDialog
          onClose={() => {
            setRevokeTarget(null);
          }}
          usage={revokeTarget}
        />
      )}
    </div>
  );
};

export const Route = createFileRoute("/_app/usage/")({
  component: UsagePage,
});
