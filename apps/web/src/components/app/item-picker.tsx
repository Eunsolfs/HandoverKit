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
  unit: string;
  stock: number;
}

const EMPTY_DISABLED_IDS: string[] = [];

interface ItemPickerProps {
  items: PickerItem[];
  value: string | null;
  onChange: (itemId: string) => void;
  disabledIds?: string[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

const itemLabel = (item: PickerItem): string =>
  item.spec === null ? item.name : `${item.name} · ${item.spec}`;

/** 用物只能从交接事项的仓库里选，禁止手工输入，避免脏数据。 */
export const ItemPicker = ({
  disabled = false,
  disabledIds = EMPTY_DISABLED_IDS,
  id,
  items,
  onChange,
  placeholder = "选择物品",
  value,
}: ItemPickerProps) => (
  <Select
    disabled={disabled}
    id={id}
    items={items.map((item) => ({
      label: `${itemLabel(item)}（库存 ${item.stock} ${item.unit}）`,
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
          {itemLabel(item)}
          <span className="text-muted-foreground ml-1 text-xs">
            库存 {item.stock} {item.unit}
            {item.stock <= 0 ? "（库存不足）" : ""}
          </span>
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
