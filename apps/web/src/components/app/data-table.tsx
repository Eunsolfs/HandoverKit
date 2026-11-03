import type { ReactNode } from "react";

import { Button } from "@handoverkit/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@handoverkit/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@handoverkit/ui/components/table";
import { cn } from "@handoverkit/ui/lib/utils";

import { EmptyState } from "#src/components/app/empty-state.tsx";
import { ErrorState } from "#src/components/app/error-state.tsx";
import { TableSkeleton } from "#src/components/app/loading.tsx";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  align?: "left" | "center" | "right";
  /** 移动端卡片里不展示的列（例如序号、纯图标操作）。 */
  hideOnMobile?: boolean;
}

const ALIGN_CLASSES = {
  center: "text-center",
  left: "text-left",
  right: "text-right",
} satisfies Record<NonNullable<DataTableColumn<never>["align"]>, string>;

const ALIGN_RIGHT = "text-right";

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  loading?: boolean;
  error?: Error;
  onRetry?: () => void;
  empty?: ReactNode;
  skeletonRows?: number;
  className?: string;
}

export const DataTable = <T,>({
  className,
  columns,
  empty,
  error,
  getRowKey,
  loading = false,
  onRetry,
  rows,
  skeletonRows,
}: DataTableProps<T>) => {
  if (loading) {
    return <TableSkeleton columns={columns.length} rows={skeletonRows} />;
  }

  if (error !== undefined) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }

  if (rows.length === 0) {
    return empty === undefined ? (
      <EmptyState description="调整筛选条件，或稍后重试。" title="暂无数据" />
    ) : (
      <div className="grid gap-3">{empty}</div>
    );
  }

  return (
    <div className={cn("grid gap-3", className)}>
      <div className="hidden overflow-hidden rounded-xl border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key}>
                  <div
                    className={cn(
                      ALIGN_CLASSES[column.align ?? "left"],
                      column.headerClassName
                    )}
                  >
                    {column.header}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={getRowKey(row)}>
                {columns.map((column) => (
                  <TableCell key={column.key}>
                    <div
                      className={cn(
                        ALIGN_CLASSES[column.align ?? "left"],
                        column.className
                      )}
                    >
                      {column.cell(row)}
                    </div>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="grid gap-2 md:hidden">
        {rows.map((row) => (
          <li className="bg-card rounded-xl border p-3" key={getRowKey(row)}>
            <dl className="grid gap-1.5 text-sm">
              {columns
                .filter((column) => column.hideOnMobile !== true)
                .map((column) => (
                  <div
                    className="flex items-start justify-between gap-3"
                    key={column.key}
                  >
                    <dt className="text-muted-foreground shrink-0 text-xs">
                      {column.header}
                    </dt>
                    <dd
                      className={cn(
                        ALIGN_RIGHT,
                        column.align === "right" && "tabular-nums"
                      )}
                    >
                      {column.cell(row)}
                    </dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
};

const DEFAULT_PAGE_SIZES = [10, 20, 50];

interface DataTablePaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  disabled?: boolean;
}

export const DataTablePagination = ({
  disabled = false,
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  total,
}: DataTablePaginationProps) => {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), pageCount);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground text-xs tabular-nums">
        共 {total} 条 · 第 {currentPage} / {pageCount} 页
      </p>
      <div className="flex items-center gap-2">
        {onPageSizeChange === undefined ? null : (
          <Select
            items={pageSizeOptions.map((option) => ({
              label: `${option} 条/页`,
              value: String(option),
            }))}
            onValueChange={(value: string | null) => {
              if (value === null) {
                return;
              }

              onPageSizeChange(Number(value));
            }}
            value={String(pageSize)}
          >
            <SelectTrigger aria-label="每页条数" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option} 条/页
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          disabled={disabled || currentPage <= 1}
          onClick={() => {
            onPageChange(currentPage - 1);
          }}
          size="sm"
          variant="outline"
        >
          上一页
        </Button>
        <Button
          disabled={disabled || currentPage >= pageCount}
          onClick={() => {
            onPageChange(currentPage + 1);
          }}
          size="sm"
          variant="outline"
        >
          下一页
        </Button>
      </div>
    </div>
  );
};
