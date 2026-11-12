import { CheckCheckIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@handoverkit/ui/components/button";
import { Checkbox } from "@handoverkit/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@handoverkit/ui/components/dialog";
import { Input } from "@handoverkit/ui/components/input";
import { cn } from "@handoverkit/ui/lib/utils";

export interface ChecklistSourceItem {
  imageUrl?: string | null;
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

const ChecklistImage = ({
  imageUrl,
  itemName,
}: {
  imageUrl: string;
  itemName: string;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        aria-label={`查看 ${itemName} 产品图`}
        className="focus-visible:ring-ring size-16 shrink-0 overflow-hidden rounded-lg border transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:outline-none sm:size-20"
        onClick={() => {
          setOpen(true);
        }}
        type="button"
      >
        <img
          alt={`${itemName} 产品图`}
          className="size-full object-cover"
          loading="lazy"
          src={imageUrl}
        />
      </button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{itemName}</DialogTitle>
          </DialogHeader>
          <img
            alt={`${itemName} 产品大图`}
            className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg object-contain"
            src={imageUrl}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

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
        <li
          className={cn(
            "rounded-lg border p-3 transition-colors",
            line.checked && "border-success/30 bg-success/5"
          )}
          key={item.itemId}
        >
          <div className="flex items-start gap-2">
            <span className="flex h-11 w-9 shrink-0 items-start justify-center pt-0.5 sm:w-8">
              <Checkbox
                aria-label={`已核对 ${item.itemName}`}
                checked={line.checked}
                disabled={disabled}
                onCheckedChange={(checked: boolean) => {
                  onChange(patchLine(lines, item.itemId, { checked }));
                }}
              />
            </span>
            <div className="grid min-w-0 flex-1 gap-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-sm leading-snug font-medium break-words">
                  {item.itemName}
                </p>
                <Button
                  aria-label={`按应有数量核对 ${item.itemName}`}
                  className="shrink-0"
                  disabled={disabled}
                  onClick={() => {
                    onChange(
                      patchLine(lines, item.itemId, {
                        actualQty: item.expectedQty,
                        checked: true,
                        note: "",
                      })
                    );
                  }}
                  size="xs"
                  type="button"
                  variant="outline"
                >
                  <CheckCheckIcon />
                  按应有核对
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                {item.itemSpec === null ? "" : `${item.itemSpec} · `}
                应有 {item.expectedQty} {item.unit}
              </p>
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
                <span className="text-muted-foreground text-xs">
                  {item.unit}
                </span>
              </div>
            </div>
            {item.imageUrl !== undefined && item.imageUrl !== null ? (
              <ChecklistImage
                imageUrl={item.imageUrl}
                itemName={item.itemName}
              />
            ) : null}
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
