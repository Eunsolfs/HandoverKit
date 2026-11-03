import { AlertTriangleIcon, RotateCwIcon } from "lucide-react";

import { Button } from "@handoverkit/ui/components/button";

import { EmptyState } from "#src/components/app/empty-state.tsx";

interface ErrorStateProps {
  error?: Error;
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export const ErrorState = ({
  description,
  error,
  onRetry,
  title = "加载失败",
}: ErrorStateProps) => {
  const fallback = "网络异常，请稍后重试。";

  const message =
    description ??
    (error === undefined || error.message.length === 0
      ? fallback
      : error.message);

  return (
    <EmptyState
      action={
        onRetry === undefined ? null : (
          <Button onClick={onRetry} size="sm" variant="outline">
            <RotateCwIcon />
            重试
          </Button>
        )
      }
      description={message}
      icon={AlertTriangleIcon}
      title={title}
    />
  );
};
