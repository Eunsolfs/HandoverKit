// 布局参考 Watermelon UI（https://ui.watermelon.sh）stats-1/stats-2 区块，MIT License。
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent } from "@handoverkit/ui/components/card";
import { cn } from "@handoverkit/ui/lib/utils";

import { isPresent } from "#src/lib/react-node.ts";

type StatTone = "primary" | "success" | "warning" | "danger" | "info";

const toneClasses = {
  danger: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning-foreground",
} satisfies Record<StatTone, string>;

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
}

export const StatCard = ({
  hint,
  icon: Icon,
  label,
  tone = "primary",
  value,
}: StatCardProps) => (
  <Card size="sm">
    <CardContent>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-muted-foreground text-xs font-medium">{label}</p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {value}
          </p>
          {isPresent(hint) ? (
            <p className="text-muted-foreground text-xs">{hint}</p>
          ) : null}
        </div>
        {Icon === undefined ? null : (
          <span
            aria-hidden="true"
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              toneClasses[tone]
            )}
          >
            <Icon className="size-4" />
          </span>
        )}
      </div>
    </CardContent>
  </Card>
);
