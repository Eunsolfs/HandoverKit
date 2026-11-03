import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MoreHorizontalIcon, PlusIcon, QrCodeIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@handoverkit/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@handoverkit/ui/components/dropdown-menu";
import { Switch } from "@handoverkit/ui/components/switch";

import { ButtonLink } from "#src/components/app/button-link.tsx";
import { ConfirmDialog } from "#src/components/app/confirm-dialog.tsx";
import { DataTable } from "#src/components/app/data-table.tsx";
import type { DataTableColumn } from "#src/components/app/data-table.tsx";
import { EmptyState } from "#src/components/app/empty-state.tsx";
import { PageHeader } from "#src/components/app/page-header.tsx";
import { RoleGuard } from "#src/components/app/role-guard.tsx";
import { StatusBadge } from "#src/components/app/status-badge.tsx";
import {
  MatterFormDialog,
  MatterQrPanel,
} from "#src/features/admin/matter-dialogs.tsx";
import { isErrorLike, useAdminTeamId } from "#src/features/admin/shared.ts";
import type { MatterDto } from "#src/features/admin/shared.ts";
import { api } from "#src/lib/api.ts";
import { formatDateTime } from "#src/lib/format.ts";

interface MatterColumnHandlers {
  onShowQr: (matter: MatterDto) => void;
  onEdit: (matter: MatterDto) => void;
  onArchive: (matter: MatterDto) => void;
  onRestore: (matter: MatterDto) => void;
}

const renderMatterActions = (
  matter: MatterDto,
  handlers: MatterColumnHandlers
) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <Button
          aria-label={`${matter.name} 操作`}
          size="icon-sm"
          variant="ghost"
        />
      }
    >
      <MoreHorizontalIcon />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem
        onClick={() => {
          handlers.onShowQr(matter);
        }}
      >
        查看二维码
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => {
          handlers.onEdit(matter);
        }}
      >
        编辑
      </DropdownMenuItem>
      {matter.status === "archived" ? (
        <DropdownMenuItem
          onClick={() => {
            handlers.onRestore(matter);
          }}
        >
          恢复使用
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem
          onClick={() => {
            handlers.onArchive(matter);
          }}
          variant="destructive"
        >
          归档
        </DropdownMenuItem>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
);

const buildMatterColumns = (
  handlers: MatterColumnHandlers
): DataTableColumn<MatterDto>[] => [
  {
    cell: (matter) => (
      <div className="grid gap-0.5">
        <span className="font-medium">{matter.name}</span>
        <span className="text-muted-foreground text-xs">
          {matter.code ?? "未设置编码"}
        </span>
      </div>
    ),
    header: "交接事项",
    key: "name",
  },
  {
    cell: (matter) => <StatusBadge status={matter.status} />,
    header: "状态",
    key: "status",
  },
  {
    align: "right",
    cell: (matter) => matter.itemCount,
    className: "tabular-nums",
    header: "物品数",
    key: "items",
  },
  {
    cell: (matter) =>
      matter.todayStatus === null ? (
        <StatusBadge label="待生成" status="pending" tone="neutral" />
      ) : (
        <StatusBadge status={matter.todayStatus} />
      ),
    header: "今日状态",
    key: "today",
  },
  {
    cell: (matter) => (
      <div className="grid gap-0.5">
        <span className="text-sm tabular-nums">v{matter.qrVersion}</span>
        <span className="text-muted-foreground text-xs">
          {formatDateTime(matter.qrChangedAt)}
        </span>
      </div>
    ),
    header: "二维码",
    hideOnMobile: true,
    key: "qr",
  },
  {
    align: "right",
    cell: (matter) => renderMatterActions(matter, handlers),
    header: "操作",
    key: "actions",
  },
];

const MattersPageContent = () => {
  const queryClient = useQueryClient();
  const teamId = useAdminTeamId();
  const [includeArchived, setIncludeArchived] = useState(true);

  const mattersQuery = useQuery({
    ...api.matters.list.queryOptions({
      input: { includeArchived, teamId: teamId ?? undefined },
    }),
    enabled: teamId !== null,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editingMatter, setEditingMatter] = useState<MatterDto | null>(null);
  const [qrMatterId, setQrMatterId] = useState<string | null>(null);
  const [rotateTarget, setRotateTarget] = useState<MatterDto | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<MatterDto | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const refreshMatters = () => {
    void queryClient.invalidateQueries({
      queryKey: api.matters.key({ type: "query" }),
    });
    void queryClient.invalidateQueries({
      queryKey: api.me.key({ type: "query" }),
    });
  };

  const rotateQr = useMutation({
    ...api.matters.rotateQr.mutationOptions(),
    onSuccess: (_data, variables) => {
      toast.success("二维码已变更，旧码立即失效");
      refreshMatters();
      setRotateTarget(null);
      setQrMatterId(variables.id);
    },
  });

  const archiveMatter = useMutation({
    ...api.matters.archive.mutationOptions(),
    onError: (error) => {
      setArchiveError(
        isErrorLike(error) ? error.message : "归档失败，请稍后重试"
      );
    },
    onSuccess: () => {
      toast.success("交接事项已归档");
      refreshMatters();
      setArchiveTarget(null);
    },
  });

  const restoreMatter = useMutation({
    ...api.matters.update.mutationOptions(),
    onSuccess: () => {
      toast.success("交接事项已恢复使用");
      refreshMatters();
    },
  });

  const rows = mattersQuery.data ?? [];
  const qrMatter = rows.find((matter) => matter.id === qrMatterId) ?? null;

  const columns = buildMatterColumns({
    onArchive: (matter) => {
      setArchiveError(null);
      setArchiveTarget(matter);
    },
    onEdit: (matter) => {
      setEditingMatter(matter);
      setFormOpen(true);
    },
    onRestore: (matter) => {
      restoreMatter.mutate({ id: matter.id, status: "active" });
    },
    onShowQr: (matter) => {
      setQrMatterId(matter.id);
    },
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        actions={
          <Button
            onClick={() => {
              setEditingMatter(null);
              setFormOpen(true);
            }}
            size="sm"
          >
            <PlusIcon />
            新建交接事项
          </Button>
        }
        description="每个事项拥有独立的物品仓库与固定二维码；变更二维码后旧码立即失效"
        title="交接事项与二维码"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Switch
            aria-label="显示已归档事项"
            checked={includeArchived}
            onCheckedChange={setIncludeArchived}
          />
          <span>显示已归档事项</span>
        </div>
        <ButtonLink href="/admin/items" size="sm" variant="outline">
          <QrCodeIcon />
          管理物品库存
        </ButtonLink>
      </div>

      {teamId === null ? (
        <EmptyState
          action={
            <ButtonLink href="/admin/teams" size="sm">
              <PlusIcon />
              去创建团队
            </ButtonLink>
          }
          description="交接事项属于某个团队，请先在团队管理中创建团队并切换当前团队。"
          title="还没有可用的团队"
        />
      ) : (
        <DataTable
          columns={columns}
          empty={
            <EmptyState
              action={
                <Button
                  onClick={() => {
                    setEditingMatter(null);
                    setFormOpen(true);
                  }}
                  size="sm"
                >
                  <PlusIcon />
                  创建交接事项
                </Button>
              }
              description="创建后即可生成二维码、维护物品库存并开始交接记录。"
              title="当前团队还没有交接事项"
            />
          }
          error={mattersQuery.isError ? mattersQuery.error : undefined}
          getRowKey={(matter) => matter.id}
          loading={mattersQuery.isPending}
          onRetry={() => {
            void mattersQuery.refetch();
          }}
          rows={rows}
        />
      )}

      {formOpen ? (
        <MatterFormDialog
          matter={editingMatter}
          onOpenChange={(next) => {
            setFormOpen(next);

            if (!next) {
              setEditingMatter(null);
            }
          }}
        />
      ) : null}

      {qrMatter === null ? null : (
        <MatterQrPanel
          matter={qrMatter}
          onOpenChange={(next) => {
            if (!next) {
              setQrMatterId(null);
            }
          }}
          onRequestRotate={() => {
            setQrMatterId(null);
            setRotateTarget(qrMatter);
          }}
          open
        />
      )}

      <ConfirmDialog
        confirmLabel="确认变更"
        description="变更后系统会生成新的二维码，已张贴的旧二维码与旧链接立即失效。请确认已准备好重新打印并张贴。"
        destructive
        onConfirm={() => {
          if (rotateTarget === null) {
            return;
          }

          rotateQr.mutate({ id: rotateTarget.id });
        }}
        onOpenChange={(next) => {
          if (!next) {
            setRotateTarget(null);
          }
        }}
        open={rotateTarget !== null}
        pending={rotateQr.isPending}
        title="申请变更二维码"
      />

      <ConfirmDialog
        confirmLabel="确认归档"
        description={
          archiveError === null ? (
            `归档后「${archiveTarget?.name ?? "该事项"}」将不再出现在扫码与默认列表中，历史记录仍保留。`
          ) : (
            <span className="text-destructive">{archiveError}</span>
          )
        }
        onConfirm={() => {
          if (archiveTarget === null) {
            return;
          }

          archiveMatter.mutate({ id: archiveTarget.id });
        }}
        onOpenChange={(next) => {
          if (!next) {
            setArchiveTarget(null);
            setArchiveError(null);
          }
        }}
        open={archiveTarget !== null}
        pending={archiveMatter.isPending}
        title="归档交接事项"
      />
    </div>
  );
};

const MattersPage = () => (
  <RoleGuard allow={["team_admin", "super_admin"]}>
    <MattersPageContent />
  </RoleGuard>
);

export const Route = createFileRoute("/_app/admin/matters")({
  component: MattersPage,
});
