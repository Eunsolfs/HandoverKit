import { Input } from "@handoverkit/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@handoverkit/ui/components/select";

import { FormField } from "#src/components/app/form-field.tsx";

type PatientType = "outpatient" | "inpatient";

export interface PatientInfo {
  patientName: string;
  patientType: PatientType;
  patientNo: string;
  patientPhone: string;
}

export interface PatientFieldErrors {
  patientName?: string;
  patientNo?: string;
  patientPhone?: string;
}

export const EMPTY_PATIENT_INFO: PatientInfo = {
  patientName: "",
  patientNo: "",
  patientPhone: "",
  patientType: "outpatient",
};

const NO_PATIENT_ERRORS: PatientFieldErrors = {};

const PATIENT_TYPE_OPTIONS = [
  { label: "门诊", value: "outpatient" },
  { label: "住院", value: "inpatient" },
] as const;

interface PatientFieldsProps {
  value: PatientInfo;
  onChange: (value: PatientInfo) => void;
  errors?: PatientFieldErrors;
  disabled?: boolean;
}

export const PatientFields = ({
  disabled = false,
  errors = NO_PATIENT_ERRORS,
  onChange,
  value,
}: PatientFieldsProps) => (
  <div className="grid gap-3 sm:grid-cols-2">
    <FormField
      error={errors.patientName}
      id="patient-name"
      label="患者姓名"
      required
    >
      {(field) => (
        <Input
          {...field}
          disabled={disabled}
          maxLength={40}
          onChange={(event) => {
            onChange({ ...value, patientName: event.target.value });
          }}
          placeholder="姓名"
          value={value.patientName}
        />
      )}
    </FormField>

    <FormField id="patient-type" label="患者类别" required>
      {(field) => (
        <Select
          disabled={disabled}
          items={PATIENT_TYPE_OPTIONS.map((option) => ({
            label: option.label,
            value: option.value,
          }))}
          onValueChange={(next: string | null) => {
            if (next === "outpatient" || next === "inpatient") {
              onChange({ ...value, patientType: next });
            }
          }}
          value={value.patientType}
        >
          <SelectTrigger className="w-full" id={field.id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PATIENT_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>

    <FormField error={errors.patientNo} id="patient-no" label="登记号" required>
      {(field) => (
        <Input
          {...field}
          disabled={disabled}
          maxLength={40}
          onChange={(event) => {
            onChange({ ...value, patientNo: event.target.value });
          }}
          placeholder="门诊号 / 住院号"
          value={value.patientNo}
        />
      )}
    </FormField>

    <FormField
      error={errors.patientPhone}
      hint="选填，便于回访核对"
      id="patient-phone"
      label="联系电话"
    >
      {(field) => (
        <Input
          {...field}
          disabled={disabled}
          inputMode="tel"
          maxLength={20}
          onChange={(event) => {
            onChange({ ...value, patientPhone: event.target.value });
          }}
          placeholder="手机号或座机"
          value={value.patientPhone}
        />
      )}
    </FormField>
  </div>
);

const PHONE_PATTERN = /^[0-9+\-\s]{6,20}$/u;

export const validatePatientInfo = (value: PatientInfo): PatientFieldErrors => {
  const errors: PatientFieldErrors = {};

  if (value.patientName.trim().length === 0) {
    errors.patientName = "请填写患者姓名";
  }

  if (value.patientNo.trim().length === 0) {
    errors.patientNo = "请填写登记号";
  }

  const phone = value.patientPhone.trim();

  if (phone.length > 0 && !PHONE_PATTERN.test(phone)) {
    errors.patientPhone = "联系电话格式不正确";
  }

  return errors;
};
