import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BoxesIcon, PackageXIcon } from "lucide-react";

import { ButtonLink } from "#src/components/app/button-link.tsx";
import { DataTable } from "#src/components/app/data-table.tsx";
import type { DataTableColumn } from "#src/components/app/data-table.tsx";
import { EmptyState } from "#src/components/app/empty-state.tsx";
import { PageHeader } from "#src/components/app/page-header.tsx";
import { RoleGuard } from "#src/components/app/role-guard.tsx";
import { StatusBadge } from "#src/components/app/status-badge.tsx";
import { useAdminTeamId } from "#src/features/admin/shared.ts";
import type { LowStockItemDto } from "#src/features/admin/shared.ts";
import { api } from "#src/lib/api.ts";

const COLUMNS: DataTableColumn<LowStockItemDto>[] = [
  {
    cell: (row) => (
      <div className="grid gap-0.5">
        <span className="font-medium">{row.name}</span>
        <span className="text-muted-foreground text-xs">
          {row.spec ?? "无规格"} · {row.unit}
        </span>
      </div>
    ),
    header: "物品",
    key: "name",
  },
  {
    cell: (row) => (
      <div className="grid gap-0.5">
        <span>{row.matterName}</span>
        <span className="text-muted-foreground text-xs">
          {row.subWarehouseName}
        </span>
      </div>
    ),
    header: "交接事项 / 子仓库",
    key: "location",
  },
  {
    align: "right",
    cell: (row) => (
      <span className="tabular-nums">
        {row.stock} / {row.minStock} {row.unit}
      </span>
    ),
    header: "当前库存 / 最低库存",
    key: "stock",
  },
  {
    cell: () => (
      <StatusBadge label="低库存" status="low-stock" tone="warning" />
    ),
    header: "状态",
    key: "status",
  },
  {
    align: "right",
    cell: () => (
      <ButtonLink href="/admin/items" size="xs" variant="outline">
        <BoxesIcon />
        去库存处理
      </ButtonLink>
    ),
    header: "操作",
    key: "actions",
  },
];

const LowStockPageContent = () => {
  const teamId = useAdminTeamId();

  const query = useQuery({
    ...api.items.lowStock.queryOptions({
      input: { teamId: teamId ?? undefined },
    }),
    enabled: teamId !== null,
  });

  if (teamId === null) {
    return (
      <div className="grid gap-6">
        <PageHeader
          description="库存低于或等于最低库存的物品"
          title="低库存物品"
        />
        <EmptyState
          action={
            <ButtonLink href="/admin/teams" size="sm">
              去创建团队
            </ButtonLink>
          }
          description="低库存按团队范围统计，请先创建并切换当前团队。"
          title="还没有可用的团队"
        />
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        actions={
          <ButtonLink href="/admin/items" size="sm" variant="outline">
            <BoxesIcon />
            查看全部库存
          </ButtonLink>
        }
        description="库存数量 ≤ 最低库存；请及时入库或调整最低库存"
        title="低库存物品"
      />
      <DataTable
        columns={COLUMNS}
        empty={
          <EmptyState
            description="当前没有低于或等于最低库存的物品。"
            icon={PackageXIcon}
            title="库存正常"
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
    </div>
  );
};

const LowStockPage = () => (
  <RoleGuard allow={["team_admin", "super_admin"]}>
    <LowStockPageContent />
  </RoleGuard>
);

export const Route = createFileRoute("/_app/admin/low-stock")({
  component: LowStockPage,
});
