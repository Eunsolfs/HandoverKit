import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Progress } from "@handoverkit/ui/components/progress";
import { cn } from "@handoverkit/ui/lib/utils";

import type { StatsOverviewDto, StatsPeriod } from "./shared.ts";

interface TrendPoint {
  label: string;
  quantity: number;
  usageCount: number;
}

const monthOf = (date: string): string => date.slice(5, 7);

const dayOf = (date: string): string => date.slice(8, 10);

/** 本年按自然月聚合，避免 365 根柱子挤在一起；周/月按天展示。 */
const buildTrendPoints = (
  byDay: StatsOverviewDto["byDay"],
  period: StatsPeriod
): TrendPoint[] => {
  if (period !== "year") {
    return byDay.map((day) => ({
      label: `${Number(monthOf(day.date))}/${Number(dayOf(day.date))}`,
      quantity: day.quantity,
      usageCount: day.usageCount,
    }));
  }

  const months = new Map<string, TrendPoint>();

  for (const day of byDay) {
    const key = day.date.slice(0, 7);
    const existing = months.get(key);

    if (existing === undefined) {
      months.set(key, {
        label: `${Number(monthOf(day.date))}月`,
        quantity: day.quantity,
        usageCount: day.usageCount,
      });
    } else {
      existing.quantity += day.quantity;
      existing.usageCount += day.usageCount;
    }
  }

  return [...months.values()];
};

interface TrendChartProps {
  byDay: StatsOverviewDto["byDay"];
  period: StatsPeriod;
  className?: string;
}

export const TrendChart = ({ byDay, className, period }: TrendChartProps) => {
  const points = buildTrendPoints(byDay, period);

  return (
    <div className={cn("h-64 w-full", className)}>
      <ResponsiveContainer height="100%" width="100%">
        <BarChart
          data={points}
          margin={{ bottom: 0, left: 0, right: 8, top: 8 }}
        >
          <CartesianGrid
            stroke="var(--border)"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            axisLine={{ stroke: "var(--border)" }}
            dataKey="label"
            interval="preserveStartEnd"
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--popover)",
              borderColor: "var(--border)",
              borderRadius: 12,
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
            cursor={{ fill: "var(--muted)" }}
          />
          <Bar
            dataKey="quantity"
            fill="var(--chart-1)"
            maxBarSize={40}
            name="消耗数量"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

interface ItemRankingProps {
  items: StatsOverviewDto["byItem"];
}

const RANKING_LIMIT = 8;

export const ItemRanking = ({ items }: ItemRankingProps) => (
  <ol className="grid gap-3">
    {items.slice(0, RANKING_LIMIT).map((item, index) => (
      <li className="grid gap-1.5" key={item.itemId}>
        <div className="flex items-baseline gap-2 text-sm">
          <span className="text-muted-foreground w-4 shrink-0 text-xs tabular-nums">
            {index + 1}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">
            {item.itemName}
            {item.spec === null ? null : (
              <span className="text-muted-foreground font-normal">
                {" "}
                · {item.spec}
              </span>
            )}
          </span>
          <span className="shrink-0 text-xs tabular-nums">
            {item.quantity} {item.unit}
          </span>
          <span className="text-muted-foreground w-10 shrink-0 text-right text-xs tabular-nums">
            {item.usageCount} 次
          </span>
        </div>
        <Progress
          aria-label={`${item.itemName} 消耗占比`}
          className="ml-6 block"
          value={Math.round(item.share * 100)}
        />
      </li>
    ))}
  </ol>
);
