import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@handoverkit/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@handoverkit/ui/components/dropdown-menu";

import { ConfirmDialog } from "#src/components/app/confirm-dialog.tsx";
import { DataTable } from "#src/components/app/data-table.tsx";
import type { DataTableColumn } from "#src/components/app/data-table.tsx";
import { EmptyState } from "#src/components/app/empty-state.tsx";
import { PageHeader } from "#src/components/app/page-header.tsx";
import { RoleGuard } from "#src/components/app/role-guard.tsx";
import { StatusBadge } from "#src/components/app/status-badge.tsx";
import { isErrorLike } from "#src/features/admin/shared.ts";
import type { TeamDto } from "#src/features/admin/shared.ts";
import { TeamFormDialog } from "#src/features/admin/team-form-dialog.tsx";
import { useActiveTeam } from "#src/lib/active-team.tsx";
import { api } from "#src/lib/api.ts";
import { formatDateTime } from "#src/lib/format.ts";

interface TeamColumnHandlers {
  onEdit: (team: TeamDto) => void;
  onToggleStatus: (team: TeamDto) => void;
  onDelete: (team: TeamDto) => void;
}

const renderTeamActions = (team: TeamDto, handlers: TeamColumnHandlers) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <Button
          aria-label={`${team.name} 操作`}
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
          handlers.onEdit(team);
        }}
      >
        编辑
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => {
          handlers.onToggleStatus(team);
        }}
      >
        {team.status === "active" ? "停用团队" : "启用团队"}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => {
          handlers.onDelete(team);
        }}
        variant="destructive"
      >
        删除
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

const buildTeamColumns = (
  handlers: TeamColumnHandlers
): DataTableColumn<TeamDto>[] => [
  {
    cell: (team) => (
      <div className="grid gap-0.5">
        <span className="font-medium">{team.name}</span>
        <span className="text-muted-foreground text-xs">{team.code}</span>
      </div>
    ),
    header: "团队",
    key: "name",
  },
  {
    align: "right",
    cell: (team) => team.memberCount,
    className: "tabular-nums",
    header: "成员数",
    key: "members",
  },
  {
    align: "right",
    cell: (team) => team.matterCount,
    className: "tabular-nums",
    header: "事项数",
    key: "matters",
  },
  {
    cell: (team) => <StatusBadge status={team.status} />,
    header: "状态",
    key: "status",
  },
  {
    cell: (team) => team.timezone,
    header: "时区",
    hideOnMobile: true,
    key: "timezone",
  },
  {
    cell: (team) => formatDateTime(team.createdAt),
    header: "创建时间",
    hideOnMobile: true,
    key: "createdAt",
  },
  {
    align: "right",
    cell: (team) => renderTeamActions(team, handlers),
    header: "操作",
    key: "actions",
  },
];

const buildDeleteDescription = (team: TeamDto | null): string => {
  if (team === null) {
    return "";
  }

  if (team.memberCount > 0 || team.matterCount > 0) {
    return `该团队下有 ${team.memberCount} 个用户、${team.matterCount} 个交接事项，服务端会拒绝删除。请先转移用户并归档交接事项。`;
  }

  return "删除后不可恢复，团队下的成员与数据将不再可访问。";
};

const TeamsPageContent = () => {
  const queryClient = useQueryClient();
  const { activeTeamId, setActiveTeamId } = useActiveTeam();
  const teamsQuery = useQuery(api.teams.list.queryOptions());
  const [formOpen, setFormOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamDto | null>(null);
  const [statusTeam, setStatusTeam] = useState<TeamDto | null>(null);
  const [deletingTeam, setDeletingTeam] = useState<TeamDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const refreshTeams = () => {
    void queryClient.invalidateQueries({
      queryKey: api.teams.key({ type: "query" }),
    });
    void queryClient.invalidateQueries({
      queryKey: api.me.key({ type: "query" }),
    });
  };

  const updateTeam = useMutation({
    ...api.teams.update.mutationOptions(),
    onSuccess: () => {
      toast.success("团队状态已更新");
      refreshTeams();
      setStatusTeam(null);
    },
  });

  const removeTeam = useMutation({
    ...api.teams.remove.mutationOptions(),
    onError: (error) => {
      setDeleteError(
        isErrorLike(error) ? error.message : "删除失败，请稍后重试"
      );
    },
    onSuccess: (_data, variables) => {
      toast.success("团队已删除");
      refreshTeams();
      setDeletingTeam(null);

      if (variables.id === activeTeamId) {
        const nextTeam = (teamsQuery.data ?? []).find(
          (team) => team.id !== variables.id
        );

        if (nextTeam === undefined) {
          // 当前团队被删且没有剩余团队时，ActiveTeamProvider 无法清空选择；
          // 整页重载会从 me.get 重新初始化团队上下文。
          window.location.assign("/admin/teams");
        } else {
          setActiveTeamId(nextTeam.id);
        }
      }
    },
  });

  const columns = buildTeamColumns({
    onDelete: (team) => {
      setDeleteError(null);
      setDeletingTeam(team);
    },
    onEdit: (team) => {
      setEditingTeam(team);
      setFormOpen(true);
    },
    onToggleStatus: (team) => {
      setStatusTeam(team);
    },
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        actions={
          <Button
            onClick={() => {
              setEditingTeam(null);
              setFormOpen(true);
            }}
            size="sm"
          >
            <PlusIcon />
            新建团队
          </Button>
        }
        description="创建团队并管理成员、交接事项的归属；删除前需先转移用户与归档事项"
        title="团队管理"
      />

      <DataTable
        columns={columns}
        empty={
          <EmptyState
            action={
              <Button
                onClick={() => {
                  setEditingTeam(null);
                  setFormOpen(true);
                }}
                size="sm"
              >
                <PlusIcon />
                新建团队
              </Button>
            }
            description="创建第一个团队后，就可以添加成员、交接事项与物品库存。"
            title="还没有团队"
          />
        }
        error={teamsQuery.isError ? teamsQuery.error : undefined}
        getRowKey={(team) => team.id}
        loading={teamsQuery.isPending}
        onRetry={() => {
          void teamsQuery.refetch();
        }}
        rows={teamsQuery.data ?? []}
      />

      {formOpen ? (
        <TeamFormDialog
          onOpenChange={(next) => {
            setFormOpen(next);

            if (!next) {
              setEditingTeam(null);
            }
          }}
          team={editingTeam}
        />
      ) : null}

      <ConfirmDialog
        confirmLabel="确认停用"
        description={
          statusTeam?.status === "active"
            ? "停用后该团队成员将无法继续使用团队数据，管理员可在需要时重新启用。"
            : "启用后该团队将恢复访问。"
        }
        destructive={statusTeam?.status === "active"}
        onConfirm={() => {
          if (statusTeam === null) {
            return;
          }

          updateTeam.mutate({
            id: statusTeam.id,
            status: statusTeam.status === "active" ? "archived" : "active",
          });
        }}
        onOpenChange={(next) => {
          if (!next) {
            setStatusTeam(null);
          }
        }}
        open={statusTeam !== null}
        pending={updateTeam.isPending}
        title={statusTeam?.status === "active" ? "停用团队" : "启用团队"}
      />

      <ConfirmDialog
        confirmLabel="确认删除"
        description={
          deleteError === null ? (
            buildDeleteDescription(deletingTeam)
          ) : (
            <span className="text-destructive">{deleteError}</span>
          )
        }
        destructive
        onConfirm={() => {
          if (deletingTeam === null) {
            return;
          }

          removeTeam.mutate({ id: deletingTeam.id });
        }}
        onOpenChange={(next) => {
          if (!next) {
            setDeletingTeam(null);
            setDeleteError(null);
          }
        }}
        open={deletingTeam !== null}
        pending={removeTeam.isPending}
        title="删除团队"
      />
    </div>
  );
};

const TeamsPage = () => (
  <RoleGuard allow={["super_admin"]}>
    <TeamsPageContent />
  </RoleGuard>
);

export const Route = createFileRoute("/_app/admin/teams")({
  component: TeamsPage,
});
