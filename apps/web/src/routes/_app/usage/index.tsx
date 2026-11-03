import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PlusIcon, RotateCcwIcon } from "lucide-react";
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
    .map((item) => `${item.itemName} × ${item.quantity} ${item.unit}`)
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
      <span className="tabular-nums">{formatRecordDate(usage.usedAt)}</span>
    ),
    header: "使用日期",
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
  operatorName: string;
  onClose: () => void;
}

const UsageCreateDialog = ({
  defaultMatterId,
  matters,
  onClose,
  operatorName,
}: UsageCreateDialogProps) => {
  const queryClient = useQueryClient();

  const [matterId, setMatterId] = useState(
    defaultMatterId ?? matters[0]?.id ?? ""
  );

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

  const matterOptions = matters.map((matter) => ({
    label: matter.name,
    value: matter.id,
  }));

  const handleSubmit = (value: UsageEntryValue) => {
    createMutation.mutate({ matterId, ...value });
  };

  const items = itemsQuery.data ?? [];
  let itemsSection: ReactNode;

  if (itemsQuery.isPending) {
    itemsSection = <p className="text-muted-foreground text-sm">物品加载中…</p>;
  } else if (itemsQuery.isError) {
    itemsSection = (
      <p className="text-destructive text-sm" role="alert">
        {itemsQuery.error.message}
      </p>
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
        onSubmit={handleSubmit}
        pending={createMutation.isPending}
        submitLabel="提交登记"
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
          <DialogTitle>用物消耗登记</DialogTitle>
          <DialogDescription>
            物品只能从所选交接事项的仓库中选择，提交后立即扣减库存。
          </DialogDescription>
        </DialogHeader>

        {matters.length === 0 ? (
          <EmptyState
            description="请先在物品库存中为当前团队创建交接事项与物品。"
            title="还没有可用的交接事项"
          />
        ) : (
          <div className="grid gap-4">
            <FormField id="usage-matter" label="交接事项" required>
              {(field) => (
                <Select
                  disabled={createMutation.isPending}
                  items={matterOptions}
                  onValueChange={(value: string | null) => {
                    if (value === null) {
                      return;
                    }

                    setMatterId(value);
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

            {itemsSection}
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
  const [createOpen, setCreateOpen] = useState(false);
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
          <Button
            disabled={matters.length === 0}
            onClick={() => {
              setCreateOpen(true);
            }}
            size="sm"
          >
            <PlusIcon />
            登记用物
          </Button>
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

      {createOpen ? (
        <UsageCreateDialog
          defaultMatterId={matterId.length === 0 ? null : matterId}
          matters={matters}
          onClose={() => {
            setCreateOpen(false);
            void queryClient.invalidateQueries();
          }}
          operatorName={me.data?.user.name ?? ""}
        />
      ) : null}

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
