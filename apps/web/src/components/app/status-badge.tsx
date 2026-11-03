import { cn } from "@handoverkit/ui/lib/utils";

type StatusTone =
  | "neutral"
  | "pending"
  | "progress"
  | "success"
  | "warning"
  | "danger";

const TONE_CLASSES = {
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  neutral: "border-border bg-muted text-muted-foreground",
  pending: "border-warning/30 bg-warning/10 text-warning-foreground",
  progress: "border-info/30 bg-info/10 text-info-foreground",
  success: "border-success/30 bg-success/10 text-success-foreground",
  warning: "border-warning/30 bg-warning/10 text-warning-foreground",
} satisfies Record<StatusTone, string>;

interface StatusMeta {
  label: string;
  tone: StatusTone;
}

const STATUS_META = {
  accepted: { label: "已接收", tone: "success" },
  active: { label: "启用", tone: "success" },
  approved: { label: "已通过", tone: "success" },
  archived: { label: "已归档", tone: "neutral" },
  disabled: { label: "已停用", tone: "neutral" },
  handover_submitted: { label: "已交班", tone: "progress" },
  open: { label: "待处理", tone: "danger" },
  pending: { label: "待审批", tone: "pending" },
  pending_acceptance: { label: "待接收", tone: "pending" },
  rejected: { label: "已驳回", tone: "neutral" },
  resolved: { label: "已解决", tone: "success" },
  revoke_pending: { label: "撤销待审批", tone: "pending" },
  revoked: { label: "已撤销", tone: "danger" },
} satisfies Record<string, StatusMeta>;

const isKnownStatus = (status: string): status is keyof typeof STATUS_META =>
  Object.hasOwn(STATUS_META, status);

interface StatusBadgeProps {
  status: string;
  label?: string;
  tone?: StatusTone;
  className?: string;
}

export const StatusBadge = ({
  className,
  label,
  status,
  tone,
}: StatusBadgeProps) => {
  const meta = isKnownStatus(status) ? STATUS_META[status] : null;
  const resolvedTone = tone ?? meta?.tone ?? "neutral";
  const resolvedLabel = label ?? meta?.label ?? status;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs leading-5 font-medium whitespace-nowrap",
        TONE_CLASSES[resolvedTone],
        className
      )}
    >
      {resolvedLabel}
    </span>
  );
};
