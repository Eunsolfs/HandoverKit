import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import type { SubmitEvent } from "react";

import { Button } from "@handoverkit/ui/components/button";
import { Card, CardContent } from "@handoverkit/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@handoverkit/ui/components/dropdown-menu";
import { Input } from "@handoverkit/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@handoverkit/ui/components/select";

import { DataTable } from "#src/components/app/data-table.tsx";
import type { DataTableColumn } from "#src/components/app/data-table.tsx";
import { EmptyState } from "#src/components/app/empty-state.tsx";
import { FormField } from "#src/components/app/form-field.tsx";
import { PageHeader } from "#src/components/app/page-header.tsx";
import { RoleGuard } from "#src/components/app/role-guard.tsx";
import { StatusBadge } from "#src/components/app/status-badge.tsx";
import { toTeamOptions } from "#src/features/admin/shared.ts";
import type { ProfileDto } from "#src/features/admin/shared.ts";
import {
  ResetPasswordDialog,
  UserCreateDialog,
  UserDeleteDialog,
  UserEditDialog,
} from "#src/features/admin/user-dialogs.tsx";
import { useActiveTeam } from "#src/lib/active-team.tsx";
import { api } from "#src/lib/api.ts";
import { useMe } from "#src/lib/me.ts";
import { ROLE_LABELS, toAppRole } from "#src/lib/roles.ts";

type RoleFilter = "all" | "super_admin" | "team_admin" | "member";

type StatusFilter = "all" | "active" | "disabled";

const ROLE_FILTER_OPTIONS: { label: string; value: RoleFilter }[] = [
  { label: "全部角色", value: "all" },
  { label: ROLE_LABELS.super_admin, value: "super_admin" },
  { label: ROLE_LABELS.team_admin, value: "team_admin" },
  { label: ROLE_LABELS.member, value: "member" },
];

const STATUS_FILTER_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "全部状态", value: "all" },
  { label: "启用中", value: "active" },
  { label: "已停用", value: "disabled" },
];

const isRoleFilter = (value: string | null): value is RoleFilter =>
  value === "all" ||
  value === "super_admin" ||
  value === "team_admin" ||
  value === "member";

const isStatusFilter = (value: string | null): value is StatusFilter =>
  value === "all" || value === "active" || value === "disabled";

interface UserListFilters {
  isSuper: boolean;
  search: string;
  roleFilter: RoleFilter;
  statusFilter: StatusFilter;
  teamFilter: string;
}

const buildUserListInput = (filters: UserListFilters) => ({
  q: filters.search.length === 0 ? undefined : filters.search,
  role: filters.roleFilter === "all" ? undefined : filters.roleFilter,
  status: filters.statusFilter === "all" ? undefined : filters.statusFilter,
  teamId:
    filters.isSuper && filters.teamFilter !== "all"
      ? filters.teamFilter
      : undefined,
});

const canEditUser = (
  user: ProfileDto,
  isSuper: boolean,
  currentUserId: string
): boolean => isSuper || user.role === "member" || user.id === currentUserId;

const canDeleteUser = (
  user: ProfileDto,
  isSuper: boolean,
  currentUserId: string
): boolean =>
  user.id !== currentUserId &&
  user.role !== "super_admin" &&
  (isSuper || user.role === "member");

interface UserColumnHandlers {
  canEdit: (user: ProfileDto) => boolean;
  canReset: (user: ProfileDto) => boolean;
  canDelete: (user: ProfileDto) => boolean;
  onEdit: (user: ProfileDto) => void;
  onReset: (user: ProfileDto) => void;
  onDelete: (user: ProfileDto) => void;
}

const renderUserActions = (user: ProfileDto, handlers: UserColumnHandlers) => {
  if (!handlers.canEdit(user)) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`${user.name} 操作`}
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
            handlers.onEdit(user);
          }}
        >
          编辑账号
        </DropdownMenuItem>
        {handlers.canReset(user) ? (
          <DropdownMenuItem
            onClick={() => {
              handlers.onReset(user);
            }}
          >
            重置密码
          </DropdownMenuItem>
        ) : null}
        {handlers.canDelete(user) ? (
          <DropdownMenuItem
            onClick={() => {
              handlers.onDelete(user);
            }}
            variant="destructive"
          >
            删除账号
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const buildUserColumns = (
  handlers: UserColumnHandlers
): DataTableColumn<ProfileDto>[] => [
  {
    cell: (user) => (
      <div className="grid gap-0.5">
        <span className="font-medium">{user.name}</span>
        <span className="text-muted-foreground text-xs">{user.username}</span>
      </div>
    ),
    header: "姓名 / 登录名",
    key: "name",
  },
  {
    cell: (user) => ROLE_LABELS[toAppRole(user.role)],
    header: "角色",
    key: "role",
  },
  {
    cell: (user) => user.teamName ?? "—",
    header: "团队",
    key: "team",
  },
  {
    cell: (user) => <StatusBadge status={user.status} />,
    header: "状态",
    key: "status",
  },
  {
    cell: (user) => user.phone ?? "—",
    header: "手机号",
    hideOnMobile: true,
    key: "phone",
  },
  {
    align: "right",
    cell: (user) => renderUserActions(user, handlers),
    header: "操作",
    key: "actions",
  },
];

const UsersPageContent = () => {
  const me = useMe();
  const { activeTeamId } = useActiveTeam();
  const role = toAppRole(me.data?.user.role);
  const currentUserId = me.data?.user.id ?? "";
  const isSuper = role === "super_admin";
  const teams = toTeamOptions(me.data?.teams ?? []);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ProfileDto | null>(null);
  const [resettingUser, setResettingUser] = useState<ProfileDto | null>(null);
  const [deletingUser, setDeletingUser] = useState<ProfileDto | null>(null);

  const usersQuery = useQuery({
    ...api.users.list.queryOptions({
      input: buildUserListInput({
        isSuper,
        roleFilter,
        search,
        statusFilter,
        teamFilter,
      }),
    }),
  });

  const columns = buildUserColumns({
    canDelete: (user) => canDeleteUser(user, isSuper, currentUserId),
    canEdit: (user) => canEditUser(user, isSuper, currentUserId),
    canReset: (user) => canDeleteUser(user, isSuper, currentUserId),
    onDelete: (user) => {
      setDeletingUser(user);
    },
    onEdit: (user) => {
      setEditingUser(user);
    },
    onReset: (user) => {
      setResettingUser(user);
    },
  });

  const submitSearch = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(searchInput.trim());
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        actions={
          <Button
            onClick={() => {
              setCreateOpen(true);
            }}
            size="sm"
          >
            <PlusIcon />
            新建账号
          </Button>
        }
        description={
          isSuper
            ? "超级管理员可跨团队管理账号；调整角色或团队前请确认交接责任。"
            : "团队管理员只能管理本团队的普通成员账号。"
        }
        title="用户管理"
      />

      <Card>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={submitSearch}
          >
            <FormField
              className="w-full sm:w-auto"
              id="user-search"
              label="搜索"
            >
              {(field) => (
                <Input
                  {...field}
                  className="w-full sm:w-52"
                  maxLength={40}
                  onChange={(event) => {
                    setSearchInput(event.target.value);
                  }}
                  placeholder="姓名 / 登录名 / 手机号"
                  value={searchInput}
                />
              )}
            </FormField>

            <FormField
              className="w-full sm:w-auto"
              id="user-role-filter"
              label="角色"
            >
              {(field) => (
                <Select
                  items={ROLE_FILTER_OPTIONS}
                  onValueChange={(next: string | null) => {
                    if (isRoleFilter(next)) {
                      setRoleFilter(next);
                    }
                  }}
                  value={roleFilter}
                >
                  <SelectTrigger className="w-full sm:w-36" id={field.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_FILTER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>

            <FormField
              className="w-full sm:w-auto"
              id="user-status-filter"
              label="状态"
            >
              {(field) => (
                <Select
                  items={STATUS_FILTER_OPTIONS}
                  onValueChange={(next: string | null) => {
                    if (isStatusFilter(next)) {
                      setStatusFilter(next);
                    }
                  }}
                  value={statusFilter}
                >
                  <SelectTrigger className="w-full sm:w-36" id={field.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_FILTER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>

            {isSuper ? (
              <FormField
                className="w-full sm:w-auto"
                id="user-team-filter"
                label="团队"
              >
                {(field) => (
                  <Select
                    items={[
                      { label: "全部团队", value: "all" },
                      ...teams.map((team) => ({
                        label: team.name,
                        value: team.id,
                      })),
                    ]}
                    onValueChange={(next: string | null) => {
                      if (next !== null) {
                        setTeamFilter(next);
                      }
                    }}
                    value={teamFilter}
                  >
                    <SelectTrigger className="w-full sm:w-40" id={field.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部团队</SelectItem>
                      {teams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            ) : null}

            <Button
              className="w-full sm:w-auto"
              size="sm"
              type="submit"
              variant="outline"
            >
              搜索
            </Button>
          </form>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        empty={
          <EmptyState
            action={
              <Button
                onClick={() => {
                  setCreateOpen(true);
                }}
                size="sm"
              >
                <PlusIcon />
                新建账号
              </Button>
            }
            description={
              search.length > 0 ||
              roleFilter !== "all" ||
              statusFilter !== "all"
                ? "调整筛选条件后再试。"
                : "创建账号后，成员即可使用登录名与初始密码登录系统。"
            }
            title="没有匹配的账号"
          />
        }
        error={usersQuery.isError ? usersQuery.error : undefined}
        getRowKey={(user) => user.id}
        loading={usersQuery.isPending}
        onRetry={() => {
          void usersQuery.refetch();
        }}
        rows={usersQuery.data ?? []}
      />

      {createOpen ? (
        <UserCreateDialog
          defaultTeamId={activeTeamId}
          onOpenChange={setCreateOpen}
          role={role}
          teams={teams}
        />
      ) : null}

      {editingUser === null ? null : (
        <UserEditDialog
          currentUserId={currentUserId}
          onOpenChange={(next) => {
            if (!next) {
              setEditingUser(null);
            }
          }}
          role={role}
          teams={teams}
          user={editingUser}
        />
      )}

      {resettingUser === null ? null : (
        <ResetPasswordDialog
          onOpenChange={(next) => {
            if (!next) {
              setResettingUser(null);
            }
          }}
          user={resettingUser}
        />
      )}

      {deletingUser === null ? null : (
        <UserDeleteDialog
          onOpenChange={(next) => {
            if (!next) {
              setDeletingUser(null);
            }
          }}
          user={deletingUser}
        />
      )}
    </div>
  );
};

const UsersPage = () => (
  <RoleGuard allow={["team_admin", "super_admin"]}>
    <UsersPageContent />
  </RoleGuard>
);

export const Route = createFileRoute("/_app/admin/users")({
  component: UsersPage,
});
