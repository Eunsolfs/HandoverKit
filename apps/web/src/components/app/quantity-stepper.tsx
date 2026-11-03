import { MinusIcon, PlusIcon } from "lucide-react";

import { Button } from "@handoverkit/ui/components/button";
import { Input } from "@handoverkit/ui/components/input";

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  label?: string;
}

export const QuantityStepper = ({
  disabled = false,
  label = "数量",
  max,
  min = 1,
  onChange,
  value,
}: QuantityStepperProps) => {
  const clamp = (next: number): number =>
    Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, next));

  return (
    <div className="flex items-center gap-1">
      <Button
        aria-label={`减少${label}`}
        className="size-9"
        disabled={disabled || value <= min}
        onClick={() => {
          onChange(clamp(value - 1));
        }}
        size="icon"
        type="button"
        variant="outline"
      >
        <MinusIcon />
      </Button>
      <Input
        aria-label={label}
        className="h-9 w-16 text-center"
        disabled={disabled}
        inputMode="numeric"
        max={max}
        min={min}
        onChange={(event) => {
          const parsed = Math.trunc(Number(event.target.value));
          onChange(Number.isFinite(parsed) ? clamp(parsed) : min);
        }}
        type="number"
        value={value}
      />
      <Button
        aria-label={`增加${label}`}
        className="size-9"
        disabled={disabled || (max !== undefined && value >= max)}
        onClick={() => {
          onChange(clamp(value + 1));
        }}
        size="icon"
        type="button"
        variant="outline"
      >
        <PlusIcon />
      </Button>
    </div>
  );
};
