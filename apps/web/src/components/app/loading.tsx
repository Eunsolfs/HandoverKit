import { Skeleton } from "@handoverkit/ui/components/skeleton";

const CARD_KEYS = ["one", "two", "three", "four"];
const ROW_KEYS = ["one", "two", "three", "four", "five", "six"];

export const PageSkeleton = () => (
  <div aria-busy="true" aria-label="页面加载中" className="grid gap-6">
    <div className="grid gap-2">
      <Skeleton className="h-8 w-44" />
      <Skeleton className="h-4 w-72" />
    </div>
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
      {CARD_KEYS.map((key) => (
        <Skeleton className="h-24" key={key} />
      ))}
    </div>
    <Skeleton className="h-64" />
  </div>
);

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export const TableSkeleton = ({
  columns = 4,
  rows = 5,
}: TableSkeletonProps) => (
  <div aria-busy="true" aria-label="数据加载中" className="grid gap-2">
    <Skeleton className="h-9" />
    {ROW_KEYS.slice(0, rows).map((key) => (
      <div className="flex gap-2" key={key}>
        {CARD_KEYS.slice(0, Math.min(columns, 4)).map((columnKey) => (
          <Skeleton className="h-10 flex-1" key={columnKey} />
        ))}
      </div>
    ))}
  </div>
);

export const CardListSkeleton = ({ rows = 3 }: { rows?: number }) => (
  <div aria-busy="true" aria-label="列表加载中" className="grid gap-3">
    {ROW_KEYS.slice(0, rows).map((key) => (
      <Skeleton className="h-24" key={key} />
    ))}
  </div>
);
