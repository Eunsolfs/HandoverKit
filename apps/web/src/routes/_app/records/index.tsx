import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@handoverkit/ui/components/select";

import { AppLink } from "#src/components/app/app-link.tsx";
import {
  DataTable,
  DataTablePagination,
} from "#src/components/app/data-table.tsx";
import type { DataTableColumn } from "#src/components/app/data-table.tsx";
import { PeriodFilter } from "#src/components/app/date-range-filter.tsx";
import { EmptyState } from "#src/components/app/empty-state.tsx";
import { PageHeader } from "#src/components/app/page-header.tsx";
import { StatusBadge } from "#src/components/app/status-badge.tsx";
import { useActiveTeam } from "#src/lib/active-team.tsx";
import { api } from "#src/lib/api.ts";
import { formatDateTime, formatRecordDate } from "#src/lib/format.ts";
import { RECORD_STATUS_OPTIONS } from "#src/lib/types.ts";
import type {
  RecordPeriod,
  RecordStatusDto,
  RecordSummaryDto,
} from "#src/lib/types.ts";

const recordsSearchSchema = z.object({
  matterId: z.string().min(1).optional(),
});

const COLUMNS: DataTableColumn<RecordSummaryDto>[] = [
  {
    cell: (record) => (
      <span className="tabular-nums">
        {formatRecordDate(record.recordDate)}
      </span>
    ),
    header: "日期",
    key: "date",
  },
  {
    cell: (record) => record.matterName,
    header: "交接事项",
    key: "matter",
  },
  {
    cell: (record) => <StatusBadge status={record.status} />,
    header: "状态",
    key: "status",
  },
  {
    cell: (record) =>
      record.acceptedByName === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <div className="grid gap-0.5">
          <span>{record.acceptedByName}</span>
          <span className="text-muted-foreground text-xs">
            {formatDateTime(record.acceptedAt)}
          </span>
        </div>
      ),
    header: "接收",
    key: "accepted",
  },
  {
    cell: (record) =>
      record.handoverByName === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <div className="grid gap-0.5">
          <span>{record.handoverByName}</span>
          <span className="text-muted-foreground text-xs">
            {formatDateTime(record.handoverAt)}
          </span>
        </div>
      ),
    header: "交班",
    key: "handover",
  },
  {
    align: "right",
    cell: (record) => <span className="tabular-nums">{record.diffCount}</span>,
    header: "差异",
    key: "diff",
  },
  {
    align: "right",
    cell: (record) => <span className="tabular-nums">{record.usageCount}</span>,
    header: "消耗",
    key: "usage",
  },
  {
    align: "right",
    cell: (record) => (
      <AppLink
        className="text-primary focus-visible:ring-ring rounded-md text-xs font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
        href={`/records/${record.id}`}
      >
        查看详情
      </AppLink>
    ),
    header: "操作",
    key: "actions",
  },
];

const ALL_MATTERS = "all";
const ALL_STATUS = "all";

const RecordsPage = () => {
  const search = Route.useSearch();
  const { activeTeamId } = useActiveTeam();
  const [matterId, setMatterId] = useState(search.matterId ?? "");
  const [period, setPeriod] = useState<RecordPeriod>("week");

  const [status, setStatus] = useState<RecordStatusDto | typeof ALL_STATUS>(
    ALL_STATUS
  );

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const mattersQuery = useQuery({
    ...api.matters.list.queryOptions({
      input: { teamId: activeTeamId ?? undefined },
    }),
    enabled: activeTeamId !== null,
  });

  const recordsQuery = useQuery({
    ...api.records.list.queryOptions({
      input: {
        matterId: matterId.length === 0 ? undefined : matterId,
        page,
        pageSize,
        period,
        status: status === ALL_STATUS ? undefined : status,
        teamId: activeTeamId ?? undefined,
      },
    }),
    enabled: activeTeamId !== null,
  });

  if (activeTeamId === null) {
    return (
      <div className="grid gap-6">
        <PageHeader title="交接记录" />
        <EmptyState
          description="超级管理员需要先创建团队并选择当前团队。"
          title="还没有可用团队"
        />
      </div>
    );
  }

  const matters = mattersQuery.data ?? [];

  const matterOptions = [
    { label: "全部交接事项", value: ALL_MATTERS },
    ...matters.map((matter) => ({ label: matter.name, value: matter.id })),
  ];

  const statusOptions = [
    { label: "全部状态", value: ALL_STATUS },
    ...RECORD_STATUS_OPTIONS,
  ];

  const result = recordsQuery.data;

  return (
    <div className="grid gap-6">
      <PageHeader
        description="按周期查看交接记录、验收进度与差异"
        title="交接记录"
      />

      <div className="flex flex-wrap items-center gap-2">
        <PeriodFilter
          onChange={(next) => {
            setPeriod(next);
            setPage(1);
          }}
          value={period}
        />
        <Select
          items={matterOptions}
          onValueChange={(value: string | null) => {
            if (value === null) {
              return;
            }

            setMatterId(value === ALL_MATTERS ? "" : value);
            setPage(1);
          }}
          value={matterId.length === 0 ? ALL_MATTERS : matterId}
        >
          <SelectTrigger aria-label="按交接事项筛选">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {matterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={statusOptions}
          onValueChange={(value: string | null) => {
            if (value === null) {
              return;
            }

            if (value === ALL_STATUS) {
              setStatus(ALL_STATUS);
              setPage(1);

              return;
            }

            const next = RECORD_STATUS_OPTIONS.find(
              (option) => option.value === value
            );

            if (next !== undefined) {
              setStatus(next.value);
              setPage(1);
            }
          }}
          value={status}
        >
          <SelectTrigger aria-label="按状态筛选">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={COLUMNS}
        empty={
          <EmptyState
            description="当前周期没有交接记录；当天首次进入扫码页或记录页时会自动生成记录。"
            title="没有符合条件的记录"
          />
        }
        error={recordsQuery.error ?? undefined}
        getRowKey={(record) => record.id}
        loading={recordsQuery.isPending}
        onRetry={() => {
          void recordsQuery.refetch();
        }}
        rows={result?.items ?? []}
      />

      {result === undefined ? null : (
        <DataTablePagination
          disabled={recordsQuery.isFetching}
          onPageChange={setPage}
          onPageSizeChange={(next) => {
            setPageSize(next);
            setPage(1);
          }}
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
        />
      )}
    </div>
  );
};

export const Route = createFileRoute("/_app/records/")({
  component: RecordsPage,
  validateSearch: recordsSearchSchema,
});
