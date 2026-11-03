import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  BoxesIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  LayersIcon,
  PackageXIcon,
  TriangleAlertIcon,
  Undo2Icon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@handoverkit/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@handoverkit/ui/components/card";
import { Input } from "@handoverkit/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@handoverkit/ui/components/select";
import { cn } from "@handoverkit/ui/lib/utils";

import { ButtonLink } from "#src/components/app/button-link.tsx";
import { DataTable } from "#src/components/app/data-table.tsx";
import type { DataTableColumn } from "#src/components/app/data-table.tsx";
import { EmptyState } from "#src/components/app/empty-state.tsx";
import { ErrorState } from "#src/components/app/error-state.tsx";
import { FormField } from "#src/components/app/form-field.tsx";
import { PageSkeleton } from "#src/components/app/loading.tsx";
import { PageHeader } from "#src/components/app/page-header.tsx";
import { RoleGuard } from "#src/components/app/role-guard.tsx";
import { StatCard } from "#src/components/app/stat-card.tsx";
import { percentText, useAdminTeamId } from "#src/features/admin/shared.ts";
import type {
  StatsOverviewDto,
  StatsPeriod,
} from "#src/features/admin/shared.ts";
import { ItemRanking, TrendChart } from "#src/features/admin/stats-charts.tsx";
import { api } from "#src/lib/api.ts";
import { formatRecordDate, toLocalDateString } from "#src/lib/format.ts";

const PERIOD_OPTIONS: { label: string; value: StatsPeriod }[] = [
  { label: "本周", value: "week" },
  { label: "本月", value: "month" },
  { label: "本年", value: "year" },
];

const PERIOD_LABELS: Record<StatsPeriod, string> = {
  month: "本月",
  week: "本周",
  year: "本年",
};

const STATS_COLUMNS: DataTableColumn<StatsOverviewDto["byItem"][number]>[] = [
  {
    cell: (item) => (
      <div className="grid gap-0.5">
        <span className="font-medium">{item.itemName}</span>
        <span className="text-muted-foreground text-xs">
          {item.spec ?? "无规格"}
        </span>
      </div>
    ),
    header: "物品",
    key: "name",
  },
  {
    cell: (item) => item.unit,
    header: "单位",
    key: "unit",
  },
  {
    align: "right",
    cell: (item) => item.quantity,
    className: "tabular-nums",
    header: "消耗数量",
    key: "quantity",
  },
  {
    align: "right",
    cell: (item) => item.usageCount,
    className: "tabular-nums",
    header: "使用次数",
    key: "usageCount",
  },
  {
    align: "right",
    cell: (item) => percentText(item.share),
    className: "tabular-nums",
    header: "占比",
    key: "share",
  },
];

const shiftAnchor = (
  anchor: string,
  period: StatsPeriod,
  direction: number
): string => {
  const date = new Date(`${anchor}T00:00:00`);

  if (period === "week") {
    date.setDate(date.getDate() + direction * 7);
  } else if (period === "month") {
    date.setMonth(date.getMonth() + direction);
  } else {
    date.setFullYear(date.getFullYear() + direction);
  }

  return toLocalDateString(date);
};

const StatsPageContent = () => {
  const teamId = useAdminTeamId();
  const [period, setPeriod] = useState<StatsPeriod>("week");
  const [anchorDate, setAnchorDate] = useState<string>(toLocalDateString());
  const [requestedMatterId, setRequestedMatterId] = useState("all");

  const mattersQuery = useQuery({
    ...api.matters.list.queryOptions({
      input: { teamId: teamId ?? undefined },
    }),
    enabled: teamId !== null,
  });

  const matters = mattersQuery.data ?? [];

  const matterFilter = matters.some((matter) => matter.id === requestedMatterId)
    ? requestedMatterId
    : "all";

  const overviewQuery = useQuery({
    ...api.stats.overview.queryOptions({
      input: {
        anchorDate,
        matterId: matterFilter === "all" ? undefined : matterFilter,
        period,
        teamId: teamId ?? undefined,
      },
    }),
    enabled: teamId !== null,
  });

  if (teamId === null) {
    return (
      <div className="grid gap-6">
        <PageHeader
          description="按周 / 月 / 年查看消耗趋势与物品排行"
          title="数据统计"
        />
        <EmptyState
          action={
            <ButtonLink href="/admin/teams" size="sm">
              去创建团队
            </ButtonLink>
          }
          description="统计按团队范围计算，请先在团队管理中创建团队并切换当前团队。"
          title="还没有可用的团队"
        />
      </div>
    );
  }

  if (overviewQuery.isPending) {
    return <PageSkeleton />;
  }

  if (overviewQuery.isError) {
    return (
      <div className="grid gap-6">
        <PageHeader
          description="按周 / 月 / 年查看消耗趋势与物品排行"
          title="数据统计"
        />
        <ErrorState
          error={overviewQuery.error}
          onRetry={() => {
            void overviewQuery.refetch();
          }}
        />
      </div>
    );
  }

  const overview = overviewQuery.data;
  const rangeLabel = `${formatRecordDate(overview.range.start)} — ${formatRecordDate(overview.range.end)}`;
  const emptyData = overview.byItem.length === 0;

  return (
    <div className="grid gap-6">
      <PageHeader
        description={`${PERIOD_LABELS[period]} · ${rangeLabel} · 仅统计未撤销的消耗记录`}
        title="数据统计"
      />

      <div className="flex flex-wrap items-end gap-3">
        <fieldset className="bg-muted inline-flex w-fit rounded-lg p-1">
          <legend className="sr-only">统计周期</legend>
          {PERIOD_OPTIONS.map((option) => (
            <button
              aria-pressed={period === option.value}
              className={cn(
                "focus-visible:ring-ring rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
                period === option.value
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
              key={option.value}
              onClick={() => {
                setPeriod(option.value);
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </fieldset>

        <div className="flex items-center gap-1">
          <Button
            aria-label="上一周期"
            onClick={() => {
              setAnchorDate((current) => shiftAnchor(current, period, -1));
            }}
            size="icon-sm"
            variant="outline"
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            aria-label="下一周期"
            onClick={() => {
              setAnchorDate((current) => shiftAnchor(current, period, 1));
            }}
            size="icon-sm"
            variant="outline"
          >
            <ChevronRightIcon />
          </Button>
          <Button
            onClick={() => {
              setAnchorDate(toLocalDateString());
            }}
            size="sm"
            variant="ghost"
          >
            回到本期
          </Button>
        </div>

        <FormField id="stats-anchor-date" label="锚点日期">
          {(field) => (
            <Input
              {...field}
              className="w-40"
              onChange={(event) => {
                if (event.target.value.length > 0) {
                  setAnchorDate(event.target.value);
                }
              }}
              type="date"
              value={anchorDate}
            />
          )}
        </FormField>

        <FormField id="stats-matter-filter" label="交接事项">
          {(field) => (
            <Select
              items={[
                { label: "全部事项", value: "all" },
                ...matters.map((matter) => ({
                  label: matter.name,
                  value: matter.id,
                })),
              ]}
              onValueChange={(next: string | null) => {
                if (next !== null) {
                  setRequestedMatterId(next);
                }
              }}
              value={matterFilter}
            >
              <SelectTrigger className="w-48" id={field.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部事项</SelectItem>
                {matters.map((matter) => (
                  <SelectItem key={matter.id} value={matter.id}>
                    {matter.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          hint={rangeLabel}
          icon={BoxesIcon}
          label="消耗总量"
          value={overview.totals.quantity}
        />
        <StatCard
          icon={LayersIcon}
          label="消耗品类数"
          tone="info"
          value={overview.totals.itemKinds}
        />
        <StatCard
          hint={`已接收 ${overview.totals.acceptedCount} 条记录`}
          icon={ClipboardListIcon}
          label="使用记录数"
          tone="success"
          value={overview.totals.usageCount}
        />
        <StatCard
          hint="待审核撤销申请"
          icon={Undo2Icon}
          label="待审批撤销"
          tone="warning"
          value={overview.alerts.pendingRevocations}
        />
        <StatCard
          hint="未解决的异常事件"
          icon={TriangleAlertIcon}
          label="未解决异常"
          tone="danger"
          value={overview.alerts.openExceptions}
        />
        <StatCard
          hint="库存低于或等于最低库存"
          icon={PackageXIcon}
          label="低库存物品"
          tone="warning"
          value={overview.alerts.lowStockItems.length}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>消耗趋势</CardTitle>
            <CardDescription>
              门诊 {overview.byPatientType.outpatient} · 住院{" "}
              {overview.byPatientType.inpatient} · 单位：件
            </CardDescription>
          </CardHeader>
          <CardContent>
            {emptyData ? (
              <EmptyState
                description="切换周期或交接事项，或先登记用物消耗。"
                title="当前周期没有消耗记录"
              />
            ) : (
              <TrendChart byDay={overview.byDay} period={period} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>物品消耗排行</CardTitle>
            <CardDescription>按消耗数量展示前 8 名</CardDescription>
          </CardHeader>
          <CardContent>
            {emptyData ? (
              <EmptyState
                description="有消耗记录后会展示物品排行。"
                title="暂无排行数据"
              />
            ) : (
              <ItemRanking items={overview.byItem} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>消耗明细</CardTitle>
          <CardDescription>
            物品、规格、单位、消耗数量、使用次数与占比
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={STATS_COLUMNS}
            empty={
              <EmptyState
                description="当前周期与筛选条件下没有消耗明细。"
                title="暂无明细"
              />
            }
            getRowKey={(item) => item.itemId}
            rows={overview.byItem}
          />
        </CardContent>
      </Card>
    </div>
  );
};

const StatsPage = () => (
  <RoleGuard allow={["team_admin", "super_admin"]}>
    <StatsPageContent />
  </RoleGuard>
);

export const Route = createFileRoute("/_app/admin/stats")({
  component: StatsPage,
});
