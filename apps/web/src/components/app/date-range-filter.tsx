import { Input } from "@handoverkit/ui/components/input";
import { Label } from "@handoverkit/ui/components/label";
import { cn } from "@handoverkit/ui/lib/utils";

import { toLocalDateString } from "#src/lib/format.ts";

type Period = "day" | "week" | "month" | "year";

const PERIOD_OPTIONS: { label: string; value: Period }[] = [
  { label: "日", value: "day" },
  { label: "周", value: "week" },
  { label: "月", value: "month" },
  { label: "年", value: "year" },
];

interface PeriodFilterProps {
  value: Period;
  onChange: (period: Period) => void;
}

const PERIOD_ACTIVE_CLASS = "bg-background text-foreground shadow-xs";
const PERIOD_IDLE_CLASS = "text-muted-foreground hover:text-foreground";

export const PeriodFilter = ({ onChange, value }: PeriodFilterProps) => (
  <fieldset className="bg-muted inline-flex w-fit rounded-lg border-0 p-1">
    <legend className="sr-only">统计周期</legend>
    {PERIOD_OPTIONS.map((option) => (
      <button
        aria-pressed={value === option.value}
        className={cn(
          "focus-visible:ring-ring min-h-11 min-w-11 rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none lg:min-h-0 lg:min-w-0",
          value === option.value ? PERIOD_ACTIVE_CLASS : PERIOD_IDLE_CLASS
        )}
        key={option.value}
        onClick={() => {
          onChange(option.value);
        }}
        type="button"
      >
        {option.label}
      </button>
    ))}
  </fieldset>
);

export interface DateRangeValue {
  from: string;
  to: string;
}

interface DateRangeFilterProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  disabled?: boolean;
}

const presetRange = (days: number): DateRangeValue => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));

  return { from: toLocalDateString(start), to: toLocalDateString(end) };
};

const monthRange = (): DateRangeValue => {
  const now = new Date();

  return {
    from: toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toLocalDateString(now),
  };
};

const PRESETS: { label: string; range: () => DateRangeValue }[] = [
  { label: "今天", range: () => presetRange(1) },
  { label: "近 7 天", range: () => presetRange(7) },
  { label: "本月", range: monthRange },
];

export const DateRangeFilter = ({
  disabled = false,
  onChange,
  value,
}: DateRangeFilterProps) => (
  <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-end">
    <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
      <div className="grid min-w-0 gap-1">
        <Label htmlFor="date-range-from">开始日期</Label>
        <Input
          className="w-full sm:w-36"
          disabled={disabled}
          id="date-range-from"
          max={value.to}
          onChange={(event) => {
            onChange({ ...value, from: event.target.value });
          }}
          type="date"
          value={value.from}
        />
      </div>
      <div className="grid min-w-0 gap-1">
        <Label htmlFor="date-range-to">结束日期</Label>
        <Input
          className="w-full sm:w-36"
          disabled={disabled}
          id="date-range-to"
          min={value.from}
          onChange={(event) => {
            onChange({ ...value, to: event.target.value });
          }}
          type="date"
          value={value.to}
        />
      </div>
    </div>
    <div className="flex flex-wrap gap-1">
      {PRESETS.map((preset) => (
        <button
          className="text-muted-foreground hover:border-primary hover:text-foreground focus-visible:ring-ring min-h-11 rounded-lg border px-3 py-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50 lg:min-h-0 lg:px-2.5"
          disabled={disabled}
          key={preset.label}
          onClick={() => {
            onChange(preset.range());
          }}
          type="button"
        >
          {preset.label}
        </button>
      ))}
    </div>
  </div>
);
