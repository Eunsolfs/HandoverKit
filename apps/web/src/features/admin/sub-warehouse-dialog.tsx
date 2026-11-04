import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveIcon, ArrowLeftRightIcon, PlusIcon } from "lucide-react";
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
import { Input } from "@handoverkit/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@handoverkit/ui/components/select";
import { Textarea } from "@handoverkit/ui/components/textarea";

import { EmptyState } from "#src/components/app/empty-state.tsx";
import { FormField } from "#src/components/app/form-field.tsx";
import { StatusBadge } from "#src/components/app/status-badge.tsx";
import { api } from "#src/lib/api.ts";

interface SubWarehouseManagerDialogProps {
  matterId: string;
  matterName: string;
  onOpenChange: (open: boolean) => void;
}

export const SubWarehouseManagerDialog = ({
  matterId,
  matterName,
  onOpenChange,
}: SubWarehouseManagerDialogProps) => {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const listQuery = useQuery({
    ...api.subWarehouses.list.queryOptions({
      input: { includeArchived: true, matterId },
    }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries();
  };

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setCode("");
    setLocation("");
    setDescription("");
    setError(null);
  };

  const createMutation = useMutation({
    ...api.subWarehouses.create.mutationOptions(),
    onSuccess: () => {
      toast.success("子仓库已创建");
      resetForm();
      invalidate();
    },
  });

  const updateMutation = useMutation({
    ...api.subWarehouses.update.mutationOptions(),
    onSuccess: () => {
      toast.success("子仓库已保存");
      resetForm();
      invalidate();
    },
  });

  const startEdit = (warehouse: {
    id: string;
    name: string;
    code: string | null;
    location: string | null;
    description: string | null;
  }) => {
    setEditingId(warehouse.id);
    setName(warehouse.name);
    setCode(warehouse.code ?? "");
    setLocation(warehouse.location ?? "");
    setDescription(warehouse.description ?? "");
    setError(null);
  };

  const submit = () => {
    if (name.trim().length === 0) {
      setError("请填写子仓库名称");

      return;
    }

    setError(null);

    if (editingId === null) {
      const trimmedCode = code.trim();
      const trimmedDescription = description.trim();
      const trimmedLocation = location.trim();

      createMutation.mutate({
        code: trimmedCode.length === 0 ? undefined : trimmedCode,
        description:
          trimmedDescription.length === 0 ? undefined : trimmedDescription,
        location: trimmedLocation.length === 0 ? undefined : trimmedLocation,
        matterId,
        name: name.trim(),
      });
    } else {
      updateMutation.mutate({
        code: code.trim().length === 0 ? null : code.trim(),
        description:
          description.trim().length === 0 ? null : description.trim(),
        id: editingId,
        location: location.trim().length === 0 ? null : location.trim(),
        name: name.trim(),
      });
    }
  };

  const toggleStatus = (id: string, status: "active" | "archived") => {
    updateMutation.mutate({ id, status });
  };

  const rows = listQuery.data ?? [];
  const pending = createMutation.isPending || updateMutation.isPending;

  let listSection: ReactNode;

  if (listQuery.isPending) {
    listSection = <p className="text-muted-foreground text-sm">加载中…</p>;
  } else if (rows.length === 0) {
    listSection = (
      <EmptyState
        description="至少创建一个子仓库后才能管理物品与交接。"
        title="还没有子仓库"
      />
    );
  } else {
    listSection = (
      <div className="grid gap-2">
        {rows.map((warehouse) => (
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
            key={warehouse.id}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium break-words">
                  {warehouse.name}
                </span>
                <StatusBadge status={warehouse.status} />
              </div>
              <p className="text-muted-foreground text-xs">
                {warehouse.code === null ? "" : `编码 ${warehouse.code} · `}
                {warehouse.location === null ? "" : `${warehouse.location} · `}
                {warehouse.itemCount} 种物品 · 库存合计 {warehouse.totalStock}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                disabled={pending}
                onClick={() => {
                  startEdit(warehouse);
                }}
                size="xs"
                type="button"
                variant="outline"
              >
                编辑
              </Button>
              <Button
                disabled={pending}
                onClick={() => {
                  toggleStatus(
                    warehouse.id,
                    warehouse.status === "active" ? "archived" : "active"
                  );
                }}
                size="xs"
                type="button"
                variant="outline"
              >
                <ArchiveIcon />
                {warehouse.status === "active" ? "停用" : "启用"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          resetForm();
        }

        onOpenChange(open);
      }}
      open
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>子仓库管理</DialogTitle>
          <DialogDescription>
            {matterName}
            ：可按门诊、住院部等使用地点划分多个子仓库，清点与交班按子仓库独立进行。
          </DialogDescription>
        </DialogHeader>

        {listSection}

        <div className="grid gap-3 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">
              {editingId === null ? "新增子仓库" : "编辑子仓库"}
            </h3>
            {editingId === null ? null : (
              <Button
                onClick={resetForm}
                size="xs"
                type="button"
                variant="ghost"
              >
                取消编辑
              </Button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="sub-warehouse-name" label="名称" required>
              {(field) => (
                <Input
                  {...field}
                  disabled={pending}
                  maxLength={60}
                  onChange={(event) => {
                    setName(event.target.value);
                  }}
                  placeholder="例如：门诊仓库"
                  value={name}
                />
              )}
            </FormField>
            <FormField id="sub-warehouse-code" label="编码">
              {(field) => (
                <Input
                  {...field}
                  disabled={pending}
                  maxLength={30}
                  onChange={(event) => {
                    setCode(event.target.value);
                  }}
                  placeholder="选填"
                  value={code}
                />
              )}
            </FormField>
            <FormField id="sub-warehouse-location" label="位置">
              {(field) => (
                <Input
                  {...field}
                  disabled={pending}
                  maxLength={60}
                  onChange={(event) => {
                    setLocation(event.target.value);
                  }}
                  placeholder="例如：门诊二楼"
                  value={location}
                />
              )}
            </FormField>
          </div>
          <FormField id="sub-warehouse-description" label="说明">
            {(field) => (
              <Textarea
                {...field}
                disabled={pending}
                maxLength={300}
                onChange={(event) => {
                  setDescription(event.target.value);
                }}
                placeholder="选填"
                value={description}
              />
            )}
          </FormField>
          {error === null ? null : (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
          {createMutation.error === null &&
          updateMutation.error === null ? null : (
            <p className="text-destructive text-sm" role="alert">
              {(createMutation.error ?? updateMutation.error)?.message}
            </p>
          )}
          <div>
            <Button disabled={pending} onClick={submit} type="button">
              <PlusIcon />
              {editingId === null ? "创建子仓库" : "保存修改"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface TransferDialogProps {
  defaultFromId: string | null;
  matterId: string;
  matterName: string;
  onOpenChange: (open: boolean) => void;
}

export const TransferDialog = ({
  defaultFromId,
  matterId,
  matterName,
  onOpenChange,
}: TransferDialogProps) => {
  const queryClient = useQueryClient();

  const warehousesQuery = useQuery({
    ...api.subWarehouses.list.queryOptions({ input: { matterId } }),
  });

  const warehouses = warehousesQuery.data ?? [];

  const [fromId, setFromId] = useState(
    defaultFromId ?? warehouses[0]?.id ?? ""
  );

  const [toId, setToId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const itemsQuery = useQuery({
    ...api.items.list.queryOptions({
      input: { matterId, subWarehouseId: fromId },
    }),
    enabled: fromId.length > 0,
  });

  const items = itemsQuery.data ?? [];
  const selectedItem = items.find((item) => item.id === itemId);

  const transferMutation = useMutation({
    ...api.items.transfer.mutationOptions(),
    onSuccess: () => {
      toast.success("调拨成功，两边库存已更新");
      void queryClient.invalidateQueries();
      onOpenChange(false);
    },
  });

  const submit = () => {
    if (fromId.length === 0 || toId.length === 0) {
      setError("请选择调出与调入子仓库");

      return;
    }

    if (fromId === toId) {
      setError("调出与调入子仓库不能相同");

      return;
    }

    if (itemId.length === 0) {
      setError("请选择要调拨的物品");

      return;
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      setError("调拨数量必须为正整数");

      return;
    }

    setError(null);
    transferMutation.mutate({
      fromSubWarehouseId: fromId,
      itemId,
      note: note.trim().length === 0 ? null : note.trim(),
      quantity,
      toSubWarehouseId: toId,
    });
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        onOpenChange(open);
      }}
      open
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>物资调拨</DialogTitle>
          <DialogDescription>
            {matterName}
            ：在两个子仓库之间调拨物资；调入仓库没有该物品时会自动建档。
          </DialogDescription>
        </DialogHeader>

        {warehouses.length < 2 ? (
          <EmptyState
            description="至少需要两个启用的子仓库才能调拨。"
            title="子仓库不足"
          />
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="transfer-from" label="调出子仓库" required>
                {(field) => (
                  <Select
                    items={warehouses.map((warehouse) => ({
                      label: warehouse.name,
                      value: warehouse.id,
                    }))}
                    onValueChange={(value: string | null) => {
                      if (value === null) {
                        return;
                      }

                      setFromId(value);
                      setItemId("");

                      if (value === toId) {
                        setToId("");
                      }
                    }}
                    value={fromId}
                  >
                    <SelectTrigger className="w-full" id={field.id}>
                      <SelectValue />
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
              <FormField id="transfer-to" label="调入子仓库" required>
                {(field) => (
                  <Select
                    items={warehouses
                      .filter((warehouse) => warehouse.id !== fromId)
                      .map((warehouse) => ({
                        label: warehouse.name,
                        value: warehouse.id,
                      }))}
                    onValueChange={(value: string | null) => {
                      if (value !== null) {
                        setToId(value);
                      }
                    }}
                    value={toId}
                  >
                    <SelectTrigger className="w-full" id={field.id}>
                      <SelectValue placeholder="选择调入仓库" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses
                        .filter((warehouse) => warehouse.id !== fromId)
                        .map((warehouse) => (
                          <SelectItem key={warehouse.id} value={warehouse.id}>
                            {warehouse.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            </div>

            <FormField id="transfer-item" label="物品" required>
              {(field) => (
                <Select
                  items={items.map((item) => ({
                    label: `${item.name}${item.spec === null ? "" : `（${item.spec}）`} · 库存 ${item.stock} ${item.unit}`,
                    value: item.id,
                  }))}
                  onValueChange={(value: string | null) => {
                    if (value !== null) {
                      setItemId(value);
                    }
                  }}
                  value={itemId}
                >
                  <SelectTrigger className="w-full" id={field.id}>
                    <SelectValue placeholder="选择调拨物品" />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                        {item.spec === null ? "" : `（${item.spec}）`} · 库存{" "}
                        {item.stock} {item.unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>

            <FormField
              hint={
                selectedItem === undefined
                  ? "调拨数量不能超过调出仓库库存"
                  : `调出仓库当前库存 ${selectedItem.stock} ${selectedItem.unit}`
              }
              id="transfer-quantity"
              label="调拨数量"
              required
            >
              {(field) => (
                <Input
                  {...field}
                  disabled={transferMutation.isPending}
                  max={selectedItem?.stock}
                  min={1}
                  onChange={(event) => {
                    setQuantity(Number(event.target.value));
                  }}
                  type="number"
                  value={quantity}
                />
              )}
            </FormField>

            <FormField id="transfer-note" label="备注">
              {(field) => (
                <Textarea
                  {...field}
                  maxLength={200}
                  onChange={(event) => {
                    setNote(event.target.value);
                  }}
                  placeholder="例如：门诊仓库不足，从住院仓库调拨"
                  value={note}
                />
              )}
            </FormField>

            {error === null ? null : (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            )}
            {transferMutation.error === null ? null : (
              <p className="text-destructive text-sm" role="alert">
                {transferMutation.error.message}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            onClick={() => {
              onOpenChange(false);
            }}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={transferMutation.isPending || warehouses.length < 2}
            onClick={submit}
            type="button"
          >
            <ArrowLeftRightIcon />
            {transferMutation.isPending ? "提交中…" : "确认调拨"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
