import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
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
import { Textarea } from "@handoverkit/ui/components/textarea";

import { ButtonLink } from "#src/components/app/button-link.tsx";
import { DataTable } from "#src/components/app/data-table.tsx";
import type { DataTableColumn } from "#src/components/app/data-table.tsx";
import { EmptyState } from "#src/components/app/empty-state.tsx";
import { FormField } from "#src/components/app/form-field.tsx";
import { PageHeader } from "#src/components/app/page-header.tsx";
import { RoleGuard } from "#src/components/app/role-guard.tsx";
import { StatusBadge } from "#src/components/app/status-badge.tsx";
import { useAdminTeamId } from "#src/features/admin/shared.ts";
import type { ExceptionDto } from "#src/features/admin/shared.ts";
import { api } from "#src/lib/api.ts";
import { formatDateTime } from "#src/lib/format.ts";

const SEVERITY_LABELS: Record<ExceptionDto["severity"], string> = {
  high: "严重",
  low: "轻微",
  medium: "一般",
};

const TYPE_LABELS: Record<ExceptionDto["type"], string> = {
  count_mismatch: "数量不符",
  damaged: "物品损坏",
  missing: "物品缺失",
  other: "其他",
};

interface ResolveTarget {
  exception: ExceptionDto;
}

const ResolveExceptionDialog = ({
  onClose,
  target,
}: {
  onClose: () => void;
  target: ResolveTarget;
}) => {
  const queryClient = useQueryClient();
  const [resolution, setResolution] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    ...api.exceptions.resolve.mutationOptions(),
    onError: (mutationError) => {
      setError(mutationError.message);
    },
    onSuccess: () => {
      toast.success("异常事件已标记为已解决");
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
          <DialogTitle>处置异常事件</DialogTitle>
          <DialogDescription>
            {target.exception.matterName} · {TYPE_LABELS[target.exception.type]}{" "}
            · {target.exception.description}
          </DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">
          请填写实际处理结果；标记已解决后仍会保留异常记录。
        </p>
        <FormField
          error={error ?? undefined}
          id="exception-resolution"
          label="处理结果"
          required
        >
          {(field) => (
            <Textarea
              {...field}
              disabled={mutation.isPending}
              maxLength={500}
              onChange={(event) => {
                setResolution(event.target.value);
              }}
              placeholder="例如：已补齐物品，现场核对无误"
              value={resolution}
            />
          )}
        </FormField>
        <DialogFooter>
          <Button
            disabled={mutation.isPending}
            onClick={onClose}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={mutation.isPending || resolution.trim().length === 0}
            onClick={() => {
              if (resolution.trim().length === 0) {
                setError("请填写处理结果");

                return;
              }

              setError(null);
              mutation.mutate({
                id: target.exception.id,
                resolution: resolution.trim(),
              });
            }}
            type="button"
          >
            {mutation.isPending ? "提交中…" : "标记已解决"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const buildColumns = (
  onResolve: (exception: ExceptionDto) => void
): DataTableColumn<ExceptionDto>[] => [
  {
    cell: (row) => (
      <div className="grid gap-0.5">
        <span className="font-medium">{row.matterName}</span>
        <span className="text-muted-foreground text-xs">
          {formatDateTime(row.reportedAt)}
        </span>
      </div>
    ),
    header: "交接事项",
    key: "matter",
  },
  {
    cell: (row) => (
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-1">
          <StatusBadge label={TYPE_LABELS[row.type]} status={row.type} />
          <StatusBadge
            label={SEVERITY_LABELS[row.severity]}
            status={row.severity}
          />
        </div>
        <span className="text-sm break-words">{row.description}</span>
      </div>
    ),
    header: "异常内容",
    key: "description",
  },
  {
    cell: (row) => row.reportedByName,
    header: "上报人",
    key: "reporter",
  },
  {
    align: "right",
    cell: (row) => (
      <Button
        onClick={() => {
          onResolve(row);
        }}
        size="xs"
      >
        处置
      </Button>
    ),
    header: "操作",
    key: "actions",
  },
];

const ExceptionsPageContent = () => {
  const teamId = useAdminTeamId();
  const [target, setTarget] = useState<ResolveTarget | null>(null);

  const query = useQuery({
    ...api.exceptions.list.queryOptions({
      input: {
        page: 1,
        pageSize: 100,
        status: "open",
        teamId: teamId ?? undefined,
      },
    }),
    enabled: teamId !== null,
  });

  if (teamId === null) {
    return (
      <div className="grid gap-6">
        <PageHeader description="查看并处置未解决的异常事件" title="异常事件" />
        <EmptyState
          action={
            <ButtonLink href="/admin/teams" size="sm">
              去创建团队
            </ButtonLink>
          }
          description="异常事件按团队范围处理，请先创建并切换当前团队。"
          title="还没有可用的团队"
        />
      </div>
    );
  }

  const columns = buildColumns((exception) => {
    setTarget({ exception });
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        actions={
          <ButtonLink href="/records" size="sm" variant="outline">
            <TriangleAlertIcon />
            查看交接记录
          </ButtonLink>
        }
        description="仅显示未解决异常；处置后保留历史记录"
        title="异常事件"
      />
      <DataTable
        columns={columns}
        empty={
          <EmptyState
            description="当前没有未解决的异常事件。"
            title="没有待处置异常"
          />
        }
        error={query.error ?? undefined}
        getRowKey={(row) => row.id}
        loading={query.isPending}
        onRetry={() => {
          void query.refetch();
        }}
        rows={query.data?.items ?? []}
      />
      {target === null ? null : (
        <ResolveExceptionDialog
          onClose={() => {
            setTarget(null);
          }}
          target={target}
        />
      )}
    </div>
  );
};

const ExceptionsPage = () => (
  <RoleGuard allow={["team_admin", "super_admin"]}>
    <ExceptionsPageContent />
  </RoleGuard>
);

export const Route = createFileRoute("/_app/admin/exceptions")({
  component: ExceptionsPage,
});
