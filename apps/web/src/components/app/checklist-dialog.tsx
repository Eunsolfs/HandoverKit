import { useState } from "react";

import { Button } from "@handoverkit/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@handoverkit/ui/components/dialog";
import { Textarea } from "@handoverkit/ui/components/textarea";

import {
  buildChecklistLines,
  ChecklistForm,
  toChecklistPayload,
  validateChecklist,
} from "#src/components/app/checklist-form.tsx";
import type {
  ChecklistLine,
  ChecklistSourceItem,
} from "#src/components/app/checklist-form.tsx";

type ChecklistPayload = ReturnType<typeof toChecklistPayload>;

interface ChecklistDialogProps {
  title: string;
  description: string;
  items: ChecklistSourceItem[];
  confirmLabel: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: ChecklistPayload, note: string | null) => void;
}

/** 记录详情页的接班核对 / 交班表确认弹窗；打开时挂载，关闭即重置。 */
export const ChecklistDialog = ({
  confirmLabel,
  description,
  items,
  onOpenChange,
  onSubmit,
  pending,
  title,
}: ChecklistDialogProps) => {
  const [lines, setLines] = useState<ChecklistLine[]>(() =>
    buildChecklistLines(items)
  );

  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const checkedCount = lines.filter((line) => line.checked).length;

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <p className="text-muted-foreground text-xs">
            已核对 {checkedCount} / {items.length} 项
          </p>
          <ChecklistForm
            disabled={pending}
            items={items}
            lines={lines}
            onChange={setLines}
          />
          <Textarea
            aria-label="交接备注"
            disabled={pending}
            maxLength={500}
            onChange={(event) => {
              setNote(event.target.value);
            }}
            placeholder="备注（选填）"
            value={note}
          />
          {error === null ? null : (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
        </div>
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
          <Button
            disabled={pending}
            onClick={() => {
              const message = validateChecklist(items, lines);

              if (message !== null) {
                setError(message);

                return;
              }

              setError(null);
              onSubmit(
                toChecklistPayload(lines),
                note.trim().length === 0 ? null : note.trim()
              );
            }}
            type="button"
          >
            {pending ? "提交中…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
