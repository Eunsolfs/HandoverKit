import { InboxIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@handoverkit/ui/lib/utils";

import { isPresent } from "#src/lib/react-node.ts";

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}

export const EmptyState = ({
  action,
  className,
  description,
  icon: Icon = InboxIcon,
  title,
}: EmptyStateProps) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center",
      className
    )}
  >
    <span className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
      <Icon aria-hidden="true" className="size-5" />
    </span>
    <div className="space-y-1">
      <p className="text-sm font-medium">{title}</p>
      {isPresent(description) ? (
        <p className="text-muted-foreground text-sm text-pretty">
          {description}
        </p>
      ) : null}
    </div>
    {isPresent(action) ? action : null}
  </div>
);
