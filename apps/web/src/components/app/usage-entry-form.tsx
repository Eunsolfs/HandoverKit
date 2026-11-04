import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import type { SubmitEvent } from "react";

import { Button } from "@handoverkit/ui/components/button";
import { Input } from "@handoverkit/ui/components/input";
import { Textarea } from "@handoverkit/ui/components/textarea";

import { FormField } from "#src/components/app/form-field.tsx";
import { ItemPicker } from "#src/components/app/item-picker.tsx";
import type { PickerItem } from "#src/components/app/item-picker.tsx";
import {
  EMPTY_PATIENT_INFO,
  PatientFields,
  validatePatientInfo,
} from "#src/components/app/patient-fields.tsx";
import type {
  PatientFieldErrors,
  PatientInfo,
} from "#src/components/app/patient-fields.tsx";
import { QuantityStepper } from "#src/components/app/quantity-stepper.tsx";
import { toLocalDateString } from "#src/lib/format.ts";

interface UsageEntryItem {
  itemId: string;
  quantity: number;
}

export interface UsageEntryValue {
  usedAt: string;
  usedTime: string | null;
  backfillReason: string | null;
  patientName: string;
  patientType: PatientInfo["patientType"];
  patientNo: string;
  patientPhone: string | null;
  operatorName: string;
  note: string | null;
  items: UsageEntryItem[];
}

interface EntryErrors {
  items?: string;
  usedAt?: string;
  usedTime?: string;
  backfillReason?: string;
  operatorName?: string;
  patient: PatientFieldErrors;
}

const EMPTY_ERRORS: EntryErrors = { patient: {} };

interface UsageRow {
  itemId: string | null;
  quantity: number;
}

const NEW_ROW: UsageRow = { itemId: null, quantity: 1 };

interface UsageEntryFormProps {
  items: PickerItem[];
  defaultOperatorName: string;
  defaultUsedAt?: string;
  /** backfill 模式额外要求使用时间与补录原因。 */
  mode?: "normal" | "backfill";
  pending?: boolean;
  submitLabel?: string;
  onSubmit: (value: UsageEntryValue) => void;
}

/** 用物消耗登记表单：物品只能从仓库选择，支持一次登记多种物品。 */
export const UsageEntryForm = ({
  defaultOperatorName,
  defaultUsedAt,
  items,
  mode = "normal",
  onSubmit,
  pending = false,
  submitLabel = "提交登记",
}: UsageEntryFormProps) => {
  const isBackfill = mode === "backfill";
  const [patient, setPatient] = useState<PatientInfo>(EMPTY_PATIENT_INFO);
  const [rows, setRows] = useState<UsageRow[]>([NEW_ROW]);
  const [usedAt, setUsedAt] = useState(defaultUsedAt ?? toLocalDateString());
  const [usedTime, setUsedTime] = useState("");
  const [backfillReason, setBackfillReason] = useState("");
  const [operatorName, setOperatorName] = useState(defaultOperatorName);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<EntryErrors>(EMPTY_ERRORS);

  const selectedIds = rows
    .map((row) => row.itemId)
    .filter((itemId): itemId is string => itemId !== null);

  const updateRow = (index: number, patch: Partial<UsageRow>) => {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row
      )
    );
  };

  // eslint-disable-next-line complexity
  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    const patientErrors = validatePatientInfo(patient);
    const nextErrors: EntryErrors = { patient: patientErrors };
    const payloadItems: UsageEntryItem[] = [];
    const seen = new Set<string>();
    let itemsError: string | undefined;

    if (rows.length === 0) {
      itemsError = "请至少添加一项物品";
    } else {
      for (const row of rows) {
        if (row.itemId === null) {
          itemsError = "请为每一行选择物品";
          break;
        }

        if (seen.has(row.itemId)) {
          itemsError = "同一物品不能重复登记";
          break;
        }

        seen.add(row.itemId);
        payloadItems.push({ itemId: row.itemId, quantity: row.quantity });
      }
    }

    if (itemsError !== undefined) {
      nextErrors.items = itemsError;
    }

    if (usedAt.length === 0) {
      nextErrors.usedAt = "请选择使用日期";
    }

    if (isBackfill && usedTime.length === 0) {
      nextErrors.usedTime = "请选择使用时间";
    }

    if (isBackfill && backfillReason.trim().length < 2) {
      nextErrors.backfillReason = "请填写补录原因（至少 2 个字）";
    }

    if (operatorName.trim().length === 0) {
      nextErrors.operatorName = "请填写操作员姓名";
    }

    setErrors(nextErrors);

    if (
      Object.keys(patientErrors).length > 0 ||
      nextErrors.items !== undefined ||
      nextErrors.usedAt !== undefined ||
      nextErrors.usedTime !== undefined ||
      nextErrors.backfillReason !== undefined ||
      nextErrors.operatorName !== undefined
    ) {
      return;
    }

    const phone = patient.patientPhone.trim();

    onSubmit({
      backfillReason: isBackfill ? backfillReason.trim() : null,
      items: payloadItems,
      note: note.trim().length === 0 ? null : note.trim(),
      operatorName: operatorName.trim(),
      patientName: patient.patientName.trim(),
      patientNo: patient.patientNo.trim(),
      patientPhone: phone.length === 0 ? null : phone,
      patientType: patient.patientType,
      usedAt,
      usedTime: isBackfill ? usedTime : null,
    });
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <section className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">物品明细</h2>
          <Button
            disabled={pending || rows.length >= items.length}
            onClick={() => {
              setRows((current) => [...current, NEW_ROW]);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <PlusIcon />
            添加物品
          </Button>
        </div>
        {rows.map((row, index) => {
          const selectedItem = items.find((item) => item.id === row.itemId);

          return (
            <div
              className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5"
              key={`row-${index.toString()}`}
            >
              <div className="w-full min-w-0 sm:flex-1">
                <ItemPicker
                  disabled={pending}
                  disabledIds={selectedIds.filter(
                    (itemId) => itemId !== row.itemId
                  )}
                  items={items}
                  onChange={(itemId) => {
                    updateRow(index, { itemId });
                  }}
                  value={row.itemId}
                />
              </div>
              <div className="ml-auto flex items-center gap-2 sm:ml-0">
                <QuantityStepper
                  disabled={pending}
                  label="数量"
                  max={
                    selectedItem === undefined || selectedItem.stock <= 0
                      ? undefined
                      : selectedItem.stock
                  }
                  min={1}
                  onChange={(quantity) => {
                    updateRow(index, { quantity });
                  }}
                  value={row.quantity}
                />
                <Button
                  aria-label="移除该物品"
                  disabled={pending || rows.length <= 1}
                  onClick={() => {
                    setRows((current) =>
                      current.filter((_, rowIndex) => rowIndex !== index)
                    );
                  }}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Trash2Icon />
                </Button>
              </div>
            </div>
          );
        })}
        {errors.items === undefined ? null : (
          <p className="text-destructive text-xs" role="alert">
            {errors.items}
          </p>
        )}
      </section>

      <section className="grid gap-2">
        <h2 className="text-sm font-medium">患者信息</h2>
        <PatientFields
          disabled={pending}
          errors={errors.patient}
          onChange={setPatient}
          value={patient}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <FormField
          error={errors.usedAt}
          id="usage-used-at"
          label="使用日期"
          required
        >
          {(field) => (
            <Input
              {...field}
              disabled={pending}
              max={toLocalDateString()}
              onChange={(event) => {
                setUsedAt(event.target.value);
              }}
              type="date"
              value={usedAt}
            />
          )}
        </FormField>
        {isBackfill ? (
          <FormField
            error={errors.usedTime}
            id="usage-used-time"
            label="使用时间"
            required
          >
            {(field) => (
              <Input
                {...field}
                disabled={pending}
                onChange={(event) => {
                  setUsedTime(event.target.value);
                }}
                type="time"
                value={usedTime}
              />
            )}
          </FormField>
        ) : null}
        <FormField
          error={errors.operatorName}
          id="usage-operator"
          label="操作员"
          required
        >
          {(field) => (
            <Input
              {...field}
              disabled={pending}
              maxLength={40}
              onChange={(event) => {
                setOperatorName(event.target.value);
              }}
              value={operatorName}
            />
          )}
        </FormField>
      </section>

      {isBackfill ? (
        <FormField
          error={errors.backfillReason}
          hint="补录不受接班门禁限制，但必须说明原因，例如：下班后补录、系统故障补录"
          id="usage-backfill-reason"
          label="补录原因"
          required
        >
          {(field) => (
            <Textarea
              {...field}
              disabled={pending}
              maxLength={300}
              onChange={(event) => {
                setBackfillReason(event.target.value);
              }}
              placeholder="请填写补录原因"
              value={backfillReason}
            />
          )}
        </FormField>
      ) : null}

      <FormField hint="选填" id="usage-note" label="备注">
        {(field) => (
          <Textarea
            {...field}
            disabled={pending}
            maxLength={300}
            onChange={(event) => {
              setNote(event.target.value);
            }}
            value={note}
          />
        )}
      </FormField>

      <div className="bg-background/95 pb-safe-bottom sticky bottom-0 z-10 -mx-4 -mb-4 border-t px-4 pt-3 backdrop-blur">
        <Button className="w-full" disabled={pending} size="lg" type="submit">
          {pending ? "提交中…" : submitLabel}
        </Button>
      </div>
    </form>
  );
};
