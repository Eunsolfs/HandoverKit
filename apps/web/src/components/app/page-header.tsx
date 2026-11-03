import type { ReactNode } from "react";

import { isPresent } from "#src/lib/react-node.ts";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

export const PageHeader = ({
  actions,
  description,
  title,
}: PageHeaderProps) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        {title}
      </h1>
      {isPresent(description) ? (
        <p className="text-muted-foreground text-sm text-pretty">
          {description}
        </p>
      ) : null}
    </div>
    {isPresent(actions) ? (
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    ) : null}
  </div>
);
