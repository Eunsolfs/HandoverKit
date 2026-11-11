import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Undo2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@handoverkit/ui/components/button";

import { ButtonLink } from "#src/components/app/button-link.tsx";
import { ConfirmDialog } from "#src/components/app/confirm-dialog.tsx";
import { DataTable } from "#src/components/app/data-table.tsx";
import type { DataTableColumn } from "#src/components/app/data-table.tsx";
import { EmptyState } from "#src/components/app/empty-state.tsx";
import { PageHeader } from "#src/components/app/page-header.tsx";
import { RoleGuard } from "#src/components/app/role-guard.tsx";
import { useAdminTeamId } from "#src/features/admin/shared.ts";
import type { PendingRevokeDto } from "#src/features/admin/shared.ts";
import { api } from "#src/lib/api.ts";
import { formatDateTime } from "#src/lib/format.ts";

const itemSummary = (usage: PendingRevokeDto["usage"]): string =>
  usage.items
    .map((item) => `${item.itemName} × ${item.quantity} ${item.unit}`)
    .join("、");

interface ReviewTarget {
  approve: boolean;
  row: PendingRevokeDto;
}

const buildColumns = (
  onReview: (row: PendingRevokeDto, approve: boolean) => void
): DataTableColumn<PendingRevokeDto>[] => [
  {
    cell: (row) => (
      <div className="grid gap-0.5">
        <span className="font-medium">{row.requestedByName}</span>
        <span className="text-muted-foreground text-xs">
          {formatDateTime(row.requestedAt)}
        </span>
      </div>
    ),
    header: "申请人",
    key: "requester",
  },
  {
    cell: (row) => row.reason,
    header: "撤销原因",
    key: "reason",
  },
  {
    cell: (row) => (
      <div className="grid gap-0.5">
        <span className="font-medium">{row.usage.patientName}</span>
        <span className="text-muted-foreground text-xs">
          {row.usage.usedAt} · {row.usage.subWarehouseName}
        </span>
        <span className="text-muted-foreground text-xs">
          {itemSummary(row.usage)}
        </span>
      </div>
    ),
    header: "用物记录",
    key: "usage",
  },
  {
    cell: (row) => row.usage.operatorName,
    header: "操作员",
    key: "operator",
  },
  {
    align: "right",
    cell: (row) => (
      <div className="flex justify-end gap-1">
        <Button
          onClick={() => {
            onReview(row, true);
          }}
          size="xs"
        >
          通过
        </Button>
        <Button
          onClick={() => {
            onReview(row, false);
          }}
          size="xs"
          variant="outline"
        >
          驳回
        </Button>
      </div>
    ),
    header: "操作",
    key: "actions",
  },
];

const RevokesPageContent = () => {
  const teamId = useAdminTeamId();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<ReviewTarget | null>(null);

  const query = useQuery({
    ...api.usage.pendingRevokes.queryOptions({
      input: { teamId: teamId ?? undefined },
    }),
    enabled: teamId !== null,
  });

  const reviewMutation = useMutation({
    ...api.usage.reviewRevoke.mutationOptions(),
    onError: (error) => {
      toast.error(error.message);
    },
    onSuccess: () => {
      toast.success(
        target?.approve === true
          ? "撤销申请已通过，库存已恢复"
          : "撤销申请已驳回"
      );
      setTarget(null);
      void queryClient.invalidateQueries();
    },
  });

  if (teamId === null) {
    return (
      <div className="grid gap-6">
        <PageHeader
          description="审批普通用户提交的用物消耗撤销申请"
          title="撤销审批"
        />
        <EmptyState
          action={
            <ButtonLink href="/admin/teams" size="sm">
              去创建团队
            </ButtonLink>
          }
          description="审批按团队范围处理，请先创建并切换当前团队。"
          title="还没有可用的团队"
        />
      </div>
    );
  }

  const columns = buildColumns((row, approve) => {
    setTarget({ approve, row });
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        actions={
          <ButtonLink href="/usage" size="sm" variant="outline">
            <Undo2Icon />
            查看用物记录
          </ButtonLink>
        }
        description="普通用户提交撤销后在这里审批；通过会恢复来源子仓库库存"
        title="撤销审批"
      />
      <DataTable
        columns={columns}
        empty={
          <EmptyState
            description="当前没有等待审批的撤销申请。"
            title="没有待审批撤销"
          />
        }
        error={query.error ?? undefined}
        getRowKey={(row) => row.id}
        loading={query.isPending}
        onRetry={() => {
          void query.refetch();
        }}
        rows={query.data ?? []}
      />
      {target === null ? null : (
        <ConfirmDialog
          confirmLabel={target.approve ? "通过并恢复库存" : "驳回申请"}
          description={
            target.approve
              ? `将恢复「${target.row.usage.patientName}」这条用物记录的库存，并把记录标记为已撤销。`
              : `将驳回「${target.row.usage.patientName}」的撤销申请，原用物记录保持启用。`
          }
          destructive={!target.approve}
          onConfirm={() => {
            reviewMutation.mutate({
              approve: target.approve,
              requestId: target.row.id,
            });
          }}
          onOpenChange={(open) => {
            if (!open) {
              setTarget(null);
            }
          }}
          open
          pending={reviewMutation.isPending}
          title={target.approve ? "通过撤销申请" : "驳回撤销申请"}
        />
      )}
    </div>
  );
};

const RevokesPage = () => (
  <RoleGuard allow={["team_admin", "super_admin"]}>
    <RevokesPageContent />
  </RoleGuard>
);

export const Route = createFileRoute("/_app/admin/revokes")({
  component: RevokesPage,
});
