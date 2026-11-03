import { Checkbox } from "@handoverkit/ui/components/checkbox";
import { Input } from "@handoverkit/ui/components/input";

export interface ChecklistSourceItem {
  itemId: string;
  itemName: string;
  itemSpec: string | null;
  unit: string;
  expectedQty: number;
}

export interface ChecklistLine {
  itemId: string;
  checked: boolean;
  actualQty: number | null;
  note: string;
}

export const buildChecklistLines = (
  items: ChecklistSourceItem[]
): ChecklistLine[] =>
  items.map((item) => ({
    actualQty: null,
    checked: false,
    itemId: item.itemId,
    note: "",
  }));

const patchLine = (
  lines: ChecklistLine[],
  itemId: string,
  patch: Partial<ChecklistLine>
): ChecklistLine[] =>
  lines.map((line) => (line.itemId === itemId ? { ...line, ...patch } : line));

/** 返回第一条不满足验收规则的提示；null 表示可以提交。 */
export const validateChecklist = (
  items: ChecklistSourceItem[],
  lines: ChecklistLine[]
): string | null => {
  for (const item of items) {
    const line = lines.find((candidate) => candidate.itemId === item.itemId);

    if (line === undefined || !line.checked) {
      return `请勾选已核对：${item.itemName}`;
    }

    const effectiveQty = line.actualQty ?? item.expectedQty;

    if (effectiveQty !== item.expectedQty && line.note.trim().length === 0) {
      return `实盘数量与应有数量不一致时必须填写备注：${item.itemName}`;
    }
  }

  return null;
};

export const toChecklistPayload = (lines: ChecklistLine[]) =>
  lines.map((line) => ({
    actualQty: line.actualQty,
    checked: line.checked,
    itemId: line.itemId,
    note: line.note.trim().length === 0 ? null : line.note.trim(),
  }));

interface ChecklistFormProps {
  items: ChecklistSourceItem[];
  lines: ChecklistLine[];
  onChange: (lines: ChecklistLine[]) => void;
  disabled?: boolean;
}

/** 逐项勾选 + 实盘数量 + 差异备注；接班核对与交班表共用。 */
export const ChecklistForm = ({
  disabled = false,
  items,
  lines,
  onChange,
}: ChecklistFormProps) => (
  <ul className="grid gap-2">
    {items.map((item) => {
      const line = lines.find((candidate) => candidate.itemId === item.itemId);

      if (line === undefined) {
        return null;
      }

      const effectiveQty = line.actualQty ?? item.expectedQty;
      const mismatch = effectiveQty !== item.expectedQty;
      const itemNoteId = `checklist-note-${item.itemId}`;

      return (
        <li className="rounded-lg border p-3" key={item.itemId}>
          <div className="flex flex-wrap items-center gap-3">
            <Checkbox
              aria-label={`已核对 ${item.itemName}`}
              checked={line.checked}
              disabled={disabled}
              onCheckedChange={(checked: boolean) => {
                onChange(patchLine(lines, item.itemId, { checked }));
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.itemName}</p>
              <p className="text-muted-foreground text-xs">
                {item.itemSpec === null ? "" : `${item.itemSpec} · `}
                应有 {item.expectedQty} {item.unit}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-xs">实盘</span>
              <Input
                aria-describedby={mismatch ? itemNoteId : undefined}
                aria-invalid={mismatch && line.note.trim().length === 0}
                aria-label={`${item.itemName} 实盘数量`}
                className="w-20"
                disabled={disabled}
                inputMode="numeric"
                min={0}
                onChange={(event) => {
                  const raw = event.target.value;

                  const nextQty =
                    raw === "" ? null : Math.max(0, Math.trunc(Number(raw)));

                  onChange(
                    patchLine(lines, item.itemId, { actualQty: nextQty })
                  );
                }}
                placeholder={String(item.expectedQty)}
                type="number"
                value={line.actualQty === null ? "" : String(line.actualQty)}
              />
              <span className="text-muted-foreground text-xs">{item.unit}</span>
            </div>
          </div>
          {mismatch ? (
            <div className="mt-2 grid gap-1">
              <Input
                aria-label={`${item.itemName} 差异备注`}
                disabled={disabled}
                id={itemNoteId}
                maxLength={300}
                onChange={(event) => {
                  onChange(
                    patchLine(lines, item.itemId, { note: event.target.value })
                  );
                }}
                placeholder="实盘与应有数量不一致，请填写备注（必填）"
                value={line.note}
              />
            </div>
          ) : null}
        </li>
      );
    })}
  </ul>
);
