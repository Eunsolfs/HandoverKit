import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeftRightIcon,
  MoreHorizontalIcon,
  PlusIcon,
  WarehouseIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@handoverkit/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@handoverkit/ui/components/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@handoverkit/ui/components/select";
import { Switch } from "@handoverkit/ui/components/switch";
import { cn } from "@handoverkit/ui/lib/utils";

import { ButtonLink } from "#src/components/app/button-link.tsx";
import { DataTable } from "#src/components/app/data-table.tsx";
import type { DataTableColumn } from "#src/components/app/data-table.tsx";
import { EmptyState } from "#src/components/app/empty-state.tsx";
import { FormField } from "#src/components/app/form-field.tsx";
import { PageHeader } from "#src/components/app/page-header.tsx";
import { RoleGuard } from "#src/components/app/role-guard.tsx";
import { StatusBadge } from "#src/components/app/status-badge.tsx";
import {
  ItemDeleteConfirmDialog,
  ItemFormDialog,
  ItemMovementsDialog,
  ItemStatusConfirmDialog,
  StockChangeDialog,
} from "#src/features/admin/item-dialogs.tsx";
import { useAdminTeamId } from "#src/features/admin/shared.ts";
import type { ItemDto } from "#src/features/admin/shared.ts";
import {
  SubWarehouseManagerDialog,
  TransferDialog,
} from "#src/features/admin/sub-warehouse-dialog.tsx";
import { api } from "#src/lib/api.ts";

type StockDialogMode = "inbound" | "adjust";

interface ItemColumnHandlers {
  onEdit: (item: ItemDto) => void;
  onInbound: (item: ItemDto) => void;
  onAdjust: (item: ItemDto) => void;
  onMovements: (item: ItemDto) => void;
  onToggleStatus: (item: ItemDto) => void;
  onDelete: (item: ItemDto) => void;
}

const renderItemActions = (item: ItemDto, handlers: ItemColumnHandlers) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <Button
          aria-label={`${item.name} 操作`}
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
          handlers.onEdit(item);
        }}
      >
        编辑
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => {
          handlers.onInbound(item);
        }}
      >
        入库
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => {
          handlers.onAdjust(item);
        }}
      >
        盘点调整
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => {
          handlers.onMovements(item);
        }}
      >
        库存流水
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => {
          handlers.onToggleStatus(item);
        }}
      >
        {item.status === "active" ? "停用" : "启用"}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => {
          handlers.onDelete(item);
        }}
        variant="destructive"
      >
        删除
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

const buildItemColumns = (
  handlers: ItemColumnHandlers
): DataTableColumn<ItemDto>[] => [
  {
    cell: (item) => (
      <div className="grid gap-0.5">
        <span className="font-medium">{item.name}</span>
        <span className="text-muted-foreground text-xs">
          {item.spec ?? "无规格"}
        </span>
      </div>
    ),
    header: "物品",
    key: "name",
  },
  {
    cell: (item) => item.category ?? "—",
    header: "分类",
    hideOnMobile: true,
    key: "category",
  },
  {
    cell: (item) => item.unit,
    header: "单位",
    key: "unit",
  },
  {
    align: "right",
    cell: (item) => (
      <div className="flex items-center justify-end gap-2">
        {item.lowStock ? (
          <StatusBadge label="低库存" status="low-stock" tone="warning" />
        ) : null}
        <span
          className={cn(
            "tabular-nums",
            item.lowStock && "text-warning-foreground"
          )}
        >
          {item.stock}
        </span>
      </div>
    ),
    header: "库存",
    key: "stock",
  },
  {
    align: "right",
    cell: (item) => item.minStock,
    className: "tabular-nums",
    header: "最低库存",
    key: "minStock",
  },
  {
    cell: (item) => item.location ?? "—",
    header: "存放位置",
    hideOnMobile: true,
    key: "location",
  },
  {
    cell: (item) => <span className="text-xs">{item.subWarehouseName}</span>,
    header: "子仓库",
    key: "subWarehouse",
  },
  {
    cell: (item) => <StatusBadge status={item.status} />,
    header: "状态",
    key: "status",
  },
  {
    align: "right",
    cell: (item) => renderItemActions(item, handlers),
    header: "操作",
    key: "actions",
  },
];

// eslint-disable-next-line complexity
const ItemsPageContent = () => {
  const teamId = useAdminTeamId();
  const [explicitMatterId, setExplicitMatterId] = useState<string | null>(null);

  const [explicitSubWarehouseId, setExplicitSubWarehouseId] = useState<
    string | null
  >(null);

  const [includeArchived, setIncludeArchived] = useState(false);
  const [warehouseManagerOpen, setWarehouseManagerOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const mattersQuery = useQuery({
    ...api.matters.list.queryOptions({
      input: { teamId: teamId ?? undefined },
    }),
    enabled: teamId !== null,
  });

  const matters = mattersQuery.data ?? [];

  const selectedMatterId = matters.some(
    (matter) => matter.id === explicitMatterId
  )
    ? explicitMatterId
    : (matters[0]?.id ?? null);

  const warehousesQuery = useQuery({
    ...api.subWarehouses.list.queryOptions({
      input: { matterId: selectedMatterId ?? "" },
    }),
    enabled: selectedMatterId !== null,
  });

  const warehouses = warehousesQuery.data ?? [];

  const selectedSubWarehouseId = warehouses.some(
    (warehouse) => warehouse.id === explicitSubWarehouseId
  )
    ? explicitSubWarehouseId
    : (warehouses[0]?.id ?? null);

  const itemsQuery = useQuery({
    ...api.items.list.queryOptions({
      input: {
        includeArchived,
        subWarehouseId: selectedSubWarehouseId ?? "",
      },
    }),
    enabled: selectedSubWarehouseId !== null,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemDto | null>(null);
  const [stockItem, setStockItem] = useState<ItemDto | null>(null);
  const [stockMode, setStockMode] = useState<StockDialogMode>("inbound");
  const [movementsItem, setMovementsItem] = useState<ItemDto | null>(null);
  const [statusItem, setStatusItem] = useState<ItemDto | null>(null);
  const [deletingItem, setDeletingItem] = useState<ItemDto | null>(null);

  const rows = itemsQuery.data ?? [];

  const selectedMatter = matters.find(
    (matter) => matter.id === selectedMatterId
  );

  const columns = buildItemColumns({
    onAdjust: (item) => {
      setStockMode("adjust");
      setStockItem(item);
    },
    onDelete: (item) => {
      setDeletingItem(item);
    },
    onEdit: (item) => {
      setEditingItem(item);
      setFormOpen(true);
    },
    onInbound: (item) => {
      setStockMode("inbound");
      setStockItem(item);
    },
    onMovements: (item) => {
      setMovementsItem(item);
    },
    onToggleStatus: (item) => {
      setStatusItem(item);
    },
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={selectedSubWarehouseId === null}
              onClick={() => {
                setEditingItem(null);
                setFormOpen(true);
              }}
              size="sm"
            >
              <PlusIcon />
              新建物品
            </Button>
            <Button
              disabled={selectedMatterId === null}
              onClick={() => {
                setTransferOpen(true);
              }}
              size="sm"
              variant="outline"
            >
              <ArrowLeftRightIcon />
              物资调拨
            </Button>
            <Button
              disabled={selectedMatterId === null}
              onClick={() => {
                setWarehouseManagerOpen(true);
              }}
              size="sm"
              variant="outline"
            >
              <WarehouseIcon />
              子仓库
            </Button>
          </div>
        }
        description={
          selectedMatter
            ? `当前交接事项：${selectedMatter.name} · 库存低于最低库存时自动标记`
            : "选择交接事项后维护该仓库的物品与库存"
        }
        title="物品库存"
      />

      <div className="flex flex-wrap items-end gap-3">
        <FormField
          className="w-full sm:w-auto"
          id="items-matter"
          label="交接事项"
        >
          {(field) => (
            <Select
              disabled={matters.length === 0}
              items={matters.map((matter) => ({
                label: matter.name,
                value: matter.id,
              }))}
              onValueChange={(next: string | null) => {
                if (next !== null) {
                  setExplicitMatterId(next);
                  setExplicitSubWarehouseId(null);
                }
              }}
              value={selectedMatterId}
            >
              <SelectTrigger className="w-full sm:w-56" id={field.id}>
                <SelectValue placeholder="选择交接事项" />
              </SelectTrigger>
              <SelectContent>
                {matters.map((matter) => (
                  <SelectItem key={matter.id} value={matter.id}>
                    {matter.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField
          className="w-full sm:w-auto"
          id="items-sub-warehouse"
          label="子仓库"
        >
          {(field) => (
            <Select
              disabled={warehouses.length === 0}
              items={warehouses.map((warehouse) => ({
                label: warehouse.name,
                value: warehouse.id,
              }))}
              onValueChange={(next: string | null) => {
                if (next !== null) {
                  setExplicitSubWarehouseId(next);
                }
              }}
              value={selectedSubWarehouseId}
            >
              <SelectTrigger className="w-full sm:w-48" id={field.id}>
                <SelectValue placeholder="选择子仓库" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((warehouse) => (
                  <SelectItem key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <div className="flex h-8 items-center gap-2 text-sm">
          <Switch
            aria-label="显示已停用物品"
            checked={includeArchived}
            onCheckedChange={setIncludeArchived}
          />
          <span>显示已停用物品</span>
        </div>
      </div>

      {matters.length === 0 ? (
        <EmptyState
          action={
            <ButtonLink href="/admin/matters" size="sm">
              <PlusIcon />
              去创建交接事项
            </ButtonLink>
          }
          description="物品属于具体的交接事项仓库，请先创建交接事项。"
          title="还没有交接事项"
        />
      ) : (
        <DataTable
          columns={columns}
          empty={
            <EmptyState
              action={
                <Button
                  onClick={() => {
                    setEditingItem(null);
                    setFormOpen(true);
                  }}
                  size="sm"
                >
                  <PlusIcon />
                  新建物品
                </Button>
              }
              description="新增物品后可以入库、盘点调整并查看库存流水。"
              title="该交接事项还没有物品"
            />
          }
          error={itemsQuery.isError ? itemsQuery.error : undefined}
          getRowKey={(item) => item.id}
          loading={itemsQuery.isPending}
          onRetry={() => {
            void itemsQuery.refetch();
          }}
          rows={rows}
        />
      )}

      {formOpen ? (
        <ItemFormDialog
          item={editingItem}
          subWarehouseId={selectedSubWarehouseId}
          onOpenChange={(next) => {
            setFormOpen(next);

            if (!next) {
              setEditingItem(null);
            }
          }}
        />
      ) : null}

      {stockItem === null ? null : (
        <StockChangeDialog
          item={stockItem}
          mode={stockMode}
          onOpenChange={(next) => {
            if (!next) {
              setStockItem(null);
            }
          }}
        />
      )}

      {movementsItem === null ? null : (
        <ItemMovementsDialog
          item={movementsItem}
          onOpenChange={(next) => {
            if (!next) {
              setMovementsItem(null);
            }
          }}
        />
      )}

      {statusItem === null ? null : (
        <ItemStatusConfirmDialog
          item={statusItem}
          onOpenChange={(next) => {
            if (!next) {
              setStatusItem(null);
            }
          }}
        />
      )}

      {deletingItem === null ? null : (
        <ItemDeleteConfirmDialog
          item={deletingItem}
          onOpenChange={(next) => {
            if (!next) {
              setDeletingItem(null);
            }
          }}
        />
      )}

      {warehouseManagerOpen && selectedMatterId !== null ? (
        <SubWarehouseManagerDialog
          matterId={selectedMatterId}
          matterName={
            matters.find((matter) => matter.id === selectedMatterId)?.name ?? ""
          }
          onOpenChange={(next) => {
            setWarehouseManagerOpen(next);
            void warehousesQuery.refetch();
          }}
        />
      ) : null}

      {transferOpen && selectedMatterId !== null ? (
        <TransferDialog
          defaultFromId={selectedSubWarehouseId}
          matterId={selectedMatterId}
          matterName={
            matters.find((matter) => matter.id === selectedMatterId)?.name ?? ""
          }
          onOpenChange={(next) => {
            setTransferOpen(next);
            void itemsQuery.refetch();
          }}
        />
      ) : null}
    </div>
  );
};

const ItemsPage = () => (
  <RoleGuard allow={["team_admin", "super_admin"]}>
    <ItemsPageContent />
  </RoleGuard>
);

export const Route = createFileRoute("/_app/admin/items")({
  component: ItemsPage,
});
