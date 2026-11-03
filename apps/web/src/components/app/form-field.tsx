import type { ReactNode } from "react";

import { Label } from "@handoverkit/ui/components/label";

interface FieldAriaProps {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
}

interface FormFieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (field: FieldAriaProps) => ReactNode;
}

/** label 与控件通过 id 关联；错误信息用 aria-describedby 暴露给读屏器。 */
export const FormField = ({
  children,
  error,
  hint,
  id,
  label,
  required = false,
}: FormFieldProps) => {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const hasError = error !== undefined && error.length > 0;
  const hasHint = hint !== undefined && hint.length > 0;

  let describedBy: string | undefined;

  if (hasError) {
    describedBy = errorId;
  } else if (hasHint) {
    describedBy = hintId;
  }

  const renderMessage = () => {
    if (hasError) {
      return (
        <p className="text-destructive text-xs" id={errorId} role="alert">
          {error}
        </p>
      );
    }

    if (hasHint) {
      return (
        <p className="text-muted-foreground text-xs" id={hintId}>
          {hint}
        </p>
      );
    }

    return null;
  };

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        ) : null}
      </Label>
      {children({
        "aria-describedby": describedBy,
        "aria-invalid": hasError,
        id,
      })}
      {renderMessage()}
    </div>
  );
};
