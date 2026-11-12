import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@handoverkit/ui/components/select";

export interface PickerItem {
  id: string;
  name: string;
  spec: string | null;
  subWarehouseId: string;
  subWarehouseName?: string;
  unit: string;
  stock: number;
}

const EMPTY_DISABLED_IDS: string[] = [];

type WarehousePosition = "none" | "prefix" | "suffix";

interface ItemPickerProps {
  items: PickerItem[];
  value: string | null;
  onChange: (itemId: string) => void;
  disabledIds?: string[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  /**
   * 物品名较长时，手机端会先截断末尾的仓库名。
   * 跨仓模式把仓库放到名称前，默认模式不重复展示同一仓库。
   */
  warehousePosition?: WarehousePosition;
}

const itemBaseLabel = (item: PickerItem): string =>
  item.spec === null ? item.name : `${item.name} · ${item.spec}`;

const itemLabel = (
  item: PickerItem,
  warehousePosition: WarehousePosition
): string => {
  const base = itemBaseLabel(item);

  if (warehousePosition === "none" || item.subWarehouseName === undefined) {
    return base;
  }

  return warehousePosition === "prefix"
    ? `【${item.subWarehouseName}】${base}`
    : `${base} · ${item.subWarehouseName}`;
};

/** 用物只能从交接事项的仓库里选，禁止手工输入，避免脏数据。 */
export const ItemPicker = ({
  disabled = false,
  disabledIds = EMPTY_DISABLED_IDS,
  id,
  items,
  onChange,
  placeholder = "选择物品",
  value,
  warehousePosition = "suffix",
}: ItemPickerProps) => (
  <Select
    disabled={disabled}
    id={id}
    items={items.map((item) => ({
      label: `${itemLabel(item, warehousePosition)}（库存 ${item.stock} ${item.unit}）`,
      value: item.id,
    }))}
    onValueChange={(next: string | null) => {
      if (next === null) {
        return;
      }

      onChange(next);
    }}
    value={value}
  >
    <SelectTrigger className="w-full">
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent>
      {items.map((item) => (
        <SelectItem
          disabled={disabledIds.includes(item.id) || item.stock <= 0}
          key={item.id}
          value={item.id}
        >
          <div className="grid min-w-0 gap-0.5 py-0.5">
            {warehousePosition === "prefix" &&
            item.subWarehouseName !== undefined ? (
              <span className="text-info text-xs font-semibold">
                {item.subWarehouseName}
              </span>
            ) : null}
            <span className="break-words">{itemBaseLabel(item)}</span>
            <span className="text-muted-foreground text-xs">
              库存 {item.stock} {item.unit}
              {item.stock <= 0 ? "（库存不足）" : ""}
            </span>
          </div>
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
