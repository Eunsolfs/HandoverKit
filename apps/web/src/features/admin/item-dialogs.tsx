import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode, SubmitEvent } from "react";
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
import { Textarea } from "@handoverkit/ui/components/textarea";

import { ConfirmDialog } from "#src/components/app/confirm-dialog.tsx";
import { EmptyState } from "#src/components/app/empty-state.tsx";
import { ErrorState } from "#src/components/app/error-state.tsx";
import { FormField } from "#src/components/app/form-field.tsx";
import { CardListSkeleton } from "#src/components/app/loading.tsx";
import { StatusBadge } from "#src/components/app/status-badge.tsx";
import { api } from "#src/lib/api.ts";
import { formatDateTime } from "#src/lib/format.ts";

import {
  isErrorLike,
  nullableText,
  optionalText,
  toWholeNumber,
} from "./shared.ts";
import type { ItemDto, StockMovementDto } from "./shared.ts";

interface ItemFormErrors {
  name?: string;
  unit?: string;
  stock?: string;
  minStock?: string;
  form?: string;
}

interface ItemFormValues {
  item: ItemDto | null;
  name: string;
  unit: string;
  stock: string;
  minStock: string;
}

const validateItemForm = (values: ItemFormValues): ItemFormErrors => {
  const next: ItemFormErrors = {};

  if (values.name.trim().length === 0) {
    next.name = "请输入物品名称";
  } else if (values.name.trim().length > 80) {
    next.name = "名称最多 80 个字符";
  }

  if (values.unit.trim().length === 0) {
    next.unit = "请输入计量单位，例如 个、支、盒";
  } else if (values.unit.trim().length > 20) {
    next.unit = "单位最多 20 个字符";
  }

  if (values.item === null && toWholeNumber(values.stock, -1) < 0) {
    next.stock = "初始库存需为不小于 0 的整数";
  }

  if (toWholeNumber(values.minStock, -1) < 0) {
    next.minStock = "最低库存需为不小于 0 的整数";
  }

  return next;
};

interface ItemFormDialogProps {
  onOpenChange: (open: boolean) => void;
  /** null 表示新建物品。 */
  item: ItemDto | null;
  /** 新建物品所属的交接事项。 */
  matterId: string | null;
}

interface ItemFormDefaults {
  name: string;
  spec: string;
  unit: string;
  category: string;
  minStock: string;
  location: string;
  note: string;
}

const buildItemFormDefaults = (item: ItemDto | null): ItemFormDefaults => ({
  category: item?.category ?? "",
  location: item?.location ?? "",
  minStock: String(item?.minStock ?? 0),
  name: item?.name ?? "",
  note: item?.note ?? "",
  spec: item?.spec ?? "",
  unit: item?.unit ?? "",
});

export const ItemFormDialog = ({
  item,
  matterId,
  onOpenChange,
}: ItemFormDialogProps) => {
  const queryClient = useQueryClient();
  const defaults = buildItemFormDefaults(item);
  const [name, setName] = useState(defaults.name);
  const [spec, setSpec] = useState(defaults.spec);
  const [unit, setUnit] = useState(defaults.unit);
  const [category, setCategory] = useState(defaults.category);
  const [stock, setStock] = useState("0");
  const [minStock, setMinStock] = useState(defaults.minStock);
  const [location, setLocation] = useState(defaults.location);
  const [note, setNote] = useState(defaults.note);
  const [errors, setErrors] = useState<ItemFormErrors>({});

  const refreshItems = () => {
    void queryClient.invalidateQueries({
      queryKey: api.items.key({ type: "query" }),
    });
    void queryClient.invalidateQueries({
      queryKey: api.matters.key({ type: "query" }),
    });
  };

  const createItem = useMutation({
    ...api.items.create.mutationOptions(),
    onError: (error) => {
      setErrors({
        form: isErrorLike(error) ? error.message : "物品创建失败，请重试",
      });
    },
    onSuccess: () => {
      toast.success("物品已创建");
      refreshItems();
      onOpenChange(false);
    },
  });

  const updateItem = useMutation({
    ...api.items.update.mutationOptions(),
    onError: (error) => {
      setErrors({
        form: isErrorLike(error) ? error.message : "物品更新失败，请重试",
      });
    },
    onSuccess: () => {
      toast.success("物品信息已更新");
      refreshItems();
      onOpenChange(false);
    },
  });

  const pending = createItem.isPending || updateItem.isPending;

  const validate = (): boolean => {
    const next = validateItemForm({ item, minStock, name, stock, unit });

    setErrors(next);

    return Object.keys(next).length === 0;
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    const minStockValue = toWholeNumber(minStock, 0);

    if (item === null) {
      if (matterId === null) {
        setErrors({ form: "请先选择交接事项" });

        return;
      }

      createItem.mutate({
        category: optionalText(category),
        location: optionalText(location),
        matterId,
        minStock: minStockValue,
        name: name.trim(),
        note: optionalText(note),
        spec: optionalText(spec),
        stock: toWholeNumber(stock, 0),
        unit: unit.trim(),
      });

      return;
    }

    updateItem.mutate({
      category: nullableText(category),
      id: item.id,
      location: nullableText(location),
      minStock: minStockValue,
      name: name.trim(),
      note: nullableText(note),
      spec: nullableText(spec),
      unit: unit.trim(),
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item === null ? "新建物品" : "编辑物品"}</DialogTitle>
          <DialogDescription>
            {item === null
              ? "初始库存会写入一条「初始」库存流水。"
              : "库存数量通过入库或盘点调整修改，编辑基础信息不会改变库存。"}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={handleSubmit}
        >
          {errors.form === undefined ? null : (
            <p className="text-destructive text-sm" role="alert">
              {errors.form}
            </p>
          )}

          <FormField
            error={errors.name}
            id="item-name"
            label="物品名称"
            required
          >
            {(field) => (
              <Input
                {...field}
                disabled={pending}
                maxLength={80}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                placeholder="例如 一次性注射器"
                value={name}
              />
            )}
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="item-spec" label="规格">
              {(field) => (
                <Input
                  {...field}
                  disabled={pending}
                  maxLength={80}
                  onChange={(event) => {
                    setSpec(event.target.value);
                  }}
                  placeholder="例如 5ml"
                  value={spec}
                />
              )}
            </FormField>

            <FormField error={errors.unit} id="item-unit" label="单位" required>
              {(field) => (
                <Input
                  {...field}
                  disabled={pending}
                  maxLength={20}
                  onChange={(event) => {
                    setUnit(event.target.value);
                  }}
                  placeholder="例如 支"
                  value={unit}
                />
              )}
            </FormField>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="item-category" label="分类">
              {(field) => (
                <Input
                  {...field}
                  disabled={pending}
                  maxLength={30}
                  onChange={(event) => {
                    setCategory(event.target.value);
                  }}
                  placeholder="例如 耗材"
                  value={category}
                />
              )}
            </FormField>

            <FormField id="item-location" label="存放位置">
              {(field) => (
                <Input
                  {...field}
                  disabled={pending}
                  maxLength={60}
                  onChange={(event) => {
                    setLocation(event.target.value);
                  }}
                  placeholder="例如 抢救车第二层"
                  value={location}
                />
              )}
            </FormField>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {item === null ? (
              <FormField
                error={errors.stock}
                hint="不小于 0 的整数"
                id="item-stock"
                label="初始库存"
              >
                {(field) => (
                  <Input
                    {...field}
                    disabled={pending}
                    inputMode="numeric"
                    min={0}
                    onChange={(event) => {
                      setStock(event.target.value);
                    }}
                    type="number"
                    value={stock}
                  />
                )}
              </FormField>
            ) : null}

            <FormField
              error={errors.minStock}
              hint="库存小于等于该值时标记为低库存"
              id="item-min-stock"
              label="最低库存"
            >
              {(field) => (
                <Input
                  {...field}
                  disabled={pending}
                  inputMode="numeric"
                  min={0}
                  onChange={(event) => {
                    setMinStock(event.target.value);
                  }}
                  type="number"
                  value={minStock}
                />
              )}
            </FormField>
          </div>

          <FormField id="item-note" label="备注">
            {(field) => (
              <Textarea
                {...field}
                disabled={pending}
                maxLength={200}
                onChange={(event) => {
                  setNote(event.target.value);
                }}
                placeholder="选填"
                value={note}
              />
            )}
          </FormField>

          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => {
                onOpenChange(false);
              }}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button disabled={pending} type="submit">
              {pending ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

interface StockChangeErrors {
  quantity?: string;
  note?: string;
  form?: string;
}

interface StockChangeDialogProps {
  onOpenChange: (open: boolean) => void;
  item: ItemDto;
  mode: "inbound" | "adjust";
}

export const StockChangeDialog = ({
  item,
  mode,
  onOpenChange,
}: StockChangeDialogProps) => {
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<StockChangeErrors>({});
  const isInbound = mode === "inbound";

  const refreshItems = () => {
    void queryClient.invalidateQueries({
      queryKey: api.items.key({ type: "query" }),
    });
    void queryClient.invalidateQueries({
      queryKey: api.stats.key({ type: "query" }),
    });
  };

  const inbound = useMutation({
    ...api.items.inbound.mutationOptions(),
    onError: (error) => {
      setErrors({
        form: isErrorLike(error) ? error.message : "入库失败，请重试",
      });
    },
    onSuccess: () => {
      toast.success("已入库");
      refreshItems();
      onOpenChange(false);
    },
  });

  const adjust = useMutation({
    ...api.items.adjust.mutationOptions(),
    onError: (error) => {
      setErrors({
        form: isErrorLike(error) ? error.message : "盘点调整失败，请重试",
      });
    },
    onSuccess: () => {
      toast.success("库存已调整");
      refreshItems();
      onOpenChange(false);
    },
  });

  const pending = inbound.isPending || adjust.isPending;
  let submitLabel = isInbound ? "确认入库" : "确认调整";

  if (pending) {
    submitLabel = "提交中…";
  }

  const validate = (): boolean => {
    const next: StockChangeErrors = {};
    const value = toWholeNumber(quantity, 0);

    if (isInbound) {
      if (value < 1) {
        next.quantity = "入库数量需为大于 0 的整数";
      }
    } else if (value === 0) {
      next.quantity = "调整数量不能为 0，减少库存请填写负数";
    }

    if (!isInbound && note.trim().length === 0) {
      next.note = "盘点调整必须填写原因";
    }

    setErrors(next);

    return Object.keys(next).length === 0;
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    if (isInbound) {
      inbound.mutate({
        id: item.id,
        note: optionalText(note),
        quantity: toWholeNumber(quantity, 1),
      });

      return;
    }

    adjust.mutate({
      id: item.id,
      note: note.trim(),
      quantityDelta: toWholeNumber(quantity, 1),
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isInbound ? "物品入库" : "盘点调整"}</DialogTitle>
          <DialogDescription>
            {`${item.name} · 当前库存 ${item.stock} ${item.unit}`}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={handleSubmit}
        >
          {errors.form === undefined ? null : (
            <p className="text-destructive text-sm" role="alert">
              {errors.form}
            </p>
          )}

          <FormField
            error={errors.quantity}
            hint={
              isInbound
                ? "入库数量会累加到当前库存"
                : "正数增加库存，负数减少库存，调整后库存不能为负"
            }
            id="stock-quantity"
            label={isInbound ? "入库数量" : "调整数量"}
            required
          >
            {(field) => (
              <Input
                {...field}
                disabled={pending}
                inputMode="numeric"
                onChange={(event) => {
                  setQuantity(event.target.value);
                }}
                type="number"
                value={quantity}
              />
            )}
          </FormField>

          <FormField
            error={errors.note}
            hint={isInbound ? "选填，例如采购单号" : undefined}
            id="stock-note"
            label={isInbound ? "备注" : "调整原因"}
            required={!isInbound}
          >
            {(field) => (
              <Textarea
                {...field}
                disabled={pending}
                maxLength={200}
                onChange={(event) => {
                  setNote(event.target.value);
                }}
                placeholder={
                  isInbound ? "选填" : "必填，例如 盘点差异、破损报废"
                }
                value={note}
              />
            )}
          </FormField>

          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => {
                onOpenChange(false);
              }}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button disabled={pending} type="submit">
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const MOVEMENT_TYPE_LABELS: Record<StockMovementDto["type"], string> = {
  adjustment: "盘点调整",
  consumption: "消耗",
  inbound: "入库",
  initial: "初始",
  revoke: "撤销恢复",
};

const MOVEMENT_TONE: Record<
  StockMovementDto["type"],
  "neutral" | "success" | "warning" | "danger" | "progress"
> = {
  adjustment: "warning",
  consumption: "danger",
  inbound: "success",
  initial: "progress",
  revoke: "neutral",
};

interface ItemMovementsDialogProps {
  onOpenChange: (open: boolean) => void;
  item: ItemDto;
}

const MovementsList = ({ movements }: { movements: StockMovementDto[] }) => (
  <ul className="grid max-h-[60vh] gap-2 overflow-y-auto">
    {movements.map((movement) => (
      <li className="bg-card rounded-lg border p-3" key={movement.id}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            label={MOVEMENT_TYPE_LABELS[movement.type]}
            status={movement.type}
            tone={MOVEMENT_TONE[movement.type]}
          />
          <span className="text-sm font-medium tabular-nums">
            {movement.quantityDelta > 0
              ? `+${movement.quantityDelta}`
              : movement.quantityDelta}
          </span>
          <span className="text-muted-foreground text-xs tabular-nums">
            操作后 {movement.stockAfter}
          </span>
          <span className="text-muted-foreground ml-auto text-xs">
            {formatDateTime(movement.createdAt)}
          </span>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          操作人：{movement.operatorName}
          {movement.note === null ? "" : ` · ${movement.note}`}
        </p>
      </li>
    ))}
  </ul>
);

export const ItemMovementsDialog = ({
  item,
  onOpenChange,
}: ItemMovementsDialogProps) => {
  const movements = useQuery({
    ...api.items.movements.queryOptions({ input: { itemId: item.id } }),
    staleTime: 10_000,
  });

  let body: ReactNode;

  if (movements.isPending) {
    body = <CardListSkeleton rows={3} />;
  } else if (movements.isError) {
    body = (
      <ErrorState
        error={movements.error}
        onRetry={() => {
          void movements.refetch();
        }}
      />
    );
  } else if (movements.data.length === 0) {
    body = (
      <EmptyState
        description="入库、消耗与盘点调整都会留下流水记录。"
        title="暂无库存流水"
      />
    );
  } else {
    body = <MovementsList movements={movements.data} />;
  }

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>库存流水</DialogTitle>
          <DialogDescription>
            {`${item.name} · 当前库存 ${item.stock} ${item.unit}（最多展示最近 100 条）`}
          </DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
};

const refreshItemViews = (queryClient: ReturnType<typeof useQueryClient>) => {
  void queryClient.invalidateQueries({
    queryKey: api.items.key({ type: "query" }),
  });
  void queryClient.invalidateQueries({
    queryKey: api.matters.key({ type: "query" }),
  });
  void queryClient.invalidateQueries({
    queryKey: api.stats.key({ type: "query" }),
  });
};

interface ItemStatusConfirmDialogProps {
  onOpenChange: (open: boolean) => void;
  item: ItemDto;
}

export const ItemStatusConfirmDialog = ({
  item,
  onOpenChange,
}: ItemStatusConfirmDialogProps) => {
  const queryClient = useQueryClient();
  const isActive = item.status === "active";

  const updateItem = useMutation({
    ...api.items.update.mutationOptions(),
    onSuccess: () => {
      toast.success("物品状态已更新");
      refreshItemViews(queryClient);
      onOpenChange(false);
    },
  });

  return (
    <ConfirmDialog
      confirmLabel={isActive ? "确认停用" : "确认启用"}
      description={
        isActive
          ? "停用后该物品不再出现在扫码清单与默认列表中，库存流水仍保留。"
          : "启用后该物品将重新出现在扫码清单与库存列表中。"
      }
      onConfirm={() => {
        updateItem.mutate({
          id: item.id,
          status: isActive ? "archived" : "active",
        });
      }}
      onOpenChange={onOpenChange}
      open
      pending={updateItem.isPending}
      title={isActive ? "停用物品" : "启用物品"}
    />
  );
};

interface ItemDeleteConfirmDialogProps {
  onOpenChange: (open: boolean) => void;
  item: ItemDto;
}

export const ItemDeleteConfirmDialog = ({
  item,
  onOpenChange,
}: ItemDeleteConfirmDialogProps) => {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const removeItem = useMutation({
    ...api.items.remove.mutationOptions(),
    onError: (mutationError) => {
      setError(
        isErrorLike(mutationError)
          ? mutationError.message
          : "删除失败，请稍后重试"
      );
    },
    onSuccess: () => {
      toast.success("物品已删除");
      refreshItemViews(queryClient);
      onOpenChange(false);
    },
  });

  return (
    <ConfirmDialog
      confirmLabel="确认删除"
      description={
        error === null ? (
          `删除后「${item.name}」将从仓库移除。若已有库存流水或交接记录，服务端会提示改为停用。`
        ) : (
          <span className="text-destructive">{error}</span>
        )
      }
      destructive
      onConfirm={() => {
        removeItem.mutate({ id: item.id });
      }}
      onOpenChange={onOpenChange}
      open
      pending={removeItem.isPending}
      title="删除物品"
    />
  );
};
