import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  CheckCircle2Icon,
  ClipboardCheckIcon,
  ScanLineIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@handoverkit/ui/components/alert";
import { Button } from "@handoverkit/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@handoverkit/ui/components/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@handoverkit/ui/components/tabs";
import { Textarea } from "@handoverkit/ui/components/textarea";

import { AppBrand } from "#src/components/app/app-brand.tsx";
import { ButtonLink } from "#src/components/app/button-link.tsx";
import {
  buildChecklistLines,
  ChecklistForm,
  toChecklistPayload,
  validateChecklist,
} from "#src/components/app/checklist-form.tsx";
import type { ChecklistLine } from "#src/components/app/checklist-form.tsx";
import { EmptyState } from "#src/components/app/empty-state.tsx";
import { ErrorState } from "#src/components/app/error-state.tsx";
import { PageSkeleton } from "#src/components/app/loading.tsx";
import { StatusBadge } from "#src/components/app/status-badge.tsx";
import { UsageEntryForm } from "#src/components/app/usage-entry-form.tsx";
import type { UsageEntryValue } from "#src/components/app/usage-entry-form.tsx";
import { api } from "#src/lib/api.ts";
import { formatRecordDate } from "#src/lib/format.ts";
import { useMe } from "#src/lib/me.ts";
import type { MatterByTokenDto, RecordDetailDto } from "#src/lib/types.ts";

type ScanTab = "accept" | "usage" | "handover";

const TAB_ACCEPT = "accept";
const TAB_USAGE = "usage";
const TAB_HANDOVER = "handover";

const isScanTab = (value: string): value is ScanTab =>
  value === TAB_ACCEPT || value === TAB_USAGE || value === TAB_HANDOVER;

const STATUS_HINTS = {
  accepted: "接班核对已完成，可以登记用物或提交交班表。",
  handover_submitted: "今日交班表已提交，本次交接闭环完成。",
  pending_acceptance: "请先完成接班核对并确认接收，才能登记用物或提交交班表。",
} as const;

const EXCEPTION_TYPE_OPTIONS = [
  { label: "数量不符", value: "count_mismatch" },
  { label: "物品缺失", value: "missing" },
  { label: "物品损坏", value: "damaged" },
  { label: "其他异常", value: "other" },
] as const;

type ExceptionTypeValue = (typeof EXCEPTION_TYPE_OPTIONS)[number]["value"];

const toExceptionType = (value: string): ExceptionTypeValue =>
  EXCEPTION_TYPE_OPTIONS.find((option) => option.value === value)?.value ??
  "count_mismatch";

const SEVERITY_OPTIONS = [
  { label: "一般", value: "medium" },
  { label: "严重", value: "high" },
  { label: "轻微", value: "low" },
] as const;

type SeverityValue = (typeof SEVERITY_OPTIONS)[number]["value"];

const toSeverity = (value: string): SeverityValue =>
  SEVERITY_OPTIONS.find((option) => option.value === value)?.value ?? "medium";

const diffItemsOf = (record: RecordDetailDto) =>
  record.items.filter(
    (item) => item.actualQty !== null && item.actualQty !== item.expectedQty
  );

const describeDiffItem = (item: RecordDetailDto["items"][number]): string => {
  const actualQty = item.actualQty ?? item.expectedQty;

  return `${item.itemName}：应有 ${item.expectedQty} ${item.unit}，实盘 ${actualQty} ${item.unit}${item.note === null ? "" : `（${item.note}）`}`;
};

const buildDiffDescription = (record: RecordDetailDto): string => {
  const items = diffItemsOf(record);

  if (items.length === 0) {
    return "";
  }

  return `接班核对发现数量差异：${items.map(describeDiffItem).join("；")}`;
};

const actualLine = (item: RecordDetailDto["items"][number]): string => {
  if (item.actualQty === null) {
    return `实盘同应有 ${item.expectedQty} ${item.unit}`;
  }

  return `实盘 ${item.actualQty} ${item.unit}（应有 ${item.expectedQty}）`;
};

const handoverActualLine = (item: RecordDetailDto["items"][number]): string =>
  item.handoverActualQty === null
    ? `同应有 ${item.expectedQty} ${item.unit}`
    : `${item.handoverActualQty} ${item.unit}`;

interface ExceptionReportFormProps {
  record: RecordDetailDto;
  onDone: () => void;
}

const ExceptionReportForm = ({ onDone, record }: ExceptionReportFormProps) => {
  const diffItems = diffItemsOf(record);

  const [itemId, setItemId] = useState<string>(
    diffItems.length === 1 ? (diffItems[0]?.itemId ?? "all") : "all"
  );

  const [type, setType] = useState<ExceptionTypeValue>("count_mismatch");
  const [severity, setSeverity] = useState<SeverityValue>("medium");

  const [description, setDescription] = useState(() =>
    buildDiffDescription(record)
  );

  const createMutation = useMutation({
    ...api.exceptions.create.mutationOptions(),
    onSuccess: () => {
      toast.success("异常上报已提交");
      onDone();
    },
  });

  const errorMessage =
    createMutation.error === null ? null : createMutation.error.message;

  return (
    <div className="grid gap-3">
      <Alert>
        <ShieldAlertIcon />
        <AlertTitle>发现 {diffItems.length} 项数量差异</AlertTitle>
        <AlertDescription>
          请先提交异常上报，之后才能登记用物消耗。
        </AlertDescription>
      </Alert>

      <div className="grid gap-2">
        <label className="text-sm font-medium" htmlFor="scan-exception-type">
          异常类型
        </label>
        <Select
          items={[...EXCEPTION_TYPE_OPTIONS]}
          onValueChange={(value) => {
            if (value === null) {
              return;
            }

            setType(toExceptionType(value));
          }}
          value={type}
        >
          <SelectTrigger className="w-full" id="scan-exception-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXCEPTION_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <label
          className="text-sm font-medium"
          htmlFor="scan-exception-severity"
        >
          严重程度
        </label>
        <Select
          items={[...SEVERITY_OPTIONS]}
          onValueChange={(value) => {
            if (value === null) {
              return;
            }

            setSeverity(toSeverity(value));
          }}
          value={severity}
        >
          <SelectTrigger className="w-full" id="scan-exception-severity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEVERITY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {diffItems.length > 1 ? (
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="scan-exception-item">
            涉及物品
          </label>
          <Select
            items={[
              { label: "全部差异（合并上报）", value: "all" },
              ...diffItems.map((item) => ({
                label: item.itemName,
                value: item.itemId,
              })),
            ]}
            onValueChange={(value) => {
              if (value === null) {
                return;
              }

              setItemId(value);
            }}
            value={itemId}
          >
            <SelectTrigger className="w-full" id="scan-exception-item">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部差异（合并上报）</SelectItem>
              {diffItems.map((item) => (
                <SelectItem key={item.itemId} value={item.itemId}>
                  {item.itemName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="grid gap-2">
        <label className="text-sm font-medium" htmlFor="scan-exception-desc">
          异常描述
        </label>
        <Textarea
          id="scan-exception-desc"
          maxLength={500}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
          placeholder="请描述发现的差异与现场情况"
          value={description}
        />
      </div>

      {errorMessage === null ? null : (
        <p className="text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      )}

      <Button
        className="w-full"
        disabled={createMutation.isPending || description.trim().length === 0}
        onClick={() => {
          if (description.trim().length === 0) {
            return;
          }

          createMutation.mutate({
            description: description.trim(),
            itemId: itemId === "all" ? undefined : itemId,
            matterId: record.matterId,
            recordId: record.id,
            severity,
            type,
          });
        }}
        type="button"
      >
        {createMutation.isPending ? "提交中…" : "提交异常上报"}
      </Button>
    </div>
  );
};

interface AcceptPanelProps {
  record: RecordDetailDto;
  onDone: () => void;
  onAccepted: () => void;
}

const AcceptPanel = ({ onAccepted, onDone, record }: AcceptPanelProps) => {
  const [lines, setLines] = useState<ChecklistLine[]>(() =>
    buildChecklistLines(record.items)
  );

  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const acceptMutation = useMutation({
    ...api.records.accept.mutationOptions(),
    onSuccess: () => {
      toast.success("已完成接班核对");
      onDone();
      onAccepted();
    },
  });

  if (!record.permissions.canAccept) {
    return (
      <div className="grid gap-3">
        <Alert>
          <ClipboardCheckIcon />
          <AlertTitle>接班核对已完成</AlertTitle>
          <AlertDescription>
            {record.acceptedByName === null
              ? "清单已锁定，如需调整请联系管理员。"
              : `${record.acceptedByName} 已确认接收，清单已锁定。`}
          </AlertDescription>
        </Alert>
        {record.permissions.requiresExceptionReport ? (
          <Alert>
            <ShieldAlertIcon />
            <AlertTitle>存在数量差异，尚未异常上报</AlertTitle>
            <AlertDescription>
              请切换到「用物登记」页提交异常上报；上报后才能登记用物消耗。
            </AlertDescription>
          </Alert>
        ) : null}
        <ul className="grid gap-2">
          {record.items.map((item) => (
            <li className="rounded-lg border p-3 text-sm" key={item.itemId}>
              <p className="font-medium break-words">{item.itemName}</p>
              <p className="text-muted-foreground text-xs break-words">
                应有 {item.expectedQty} {item.unit} · {actualLine(item)}
                {item.note === null ? "" : ` · 备注：${item.note}`}
              </p>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-muted-foreground text-xs">
        逐项勾选已核对；实盘数量与应有数量不一致时必须填写备注。
      </p>
      <ChecklistForm
        disabled={acceptMutation.isPending}
        items={record.items}
        lines={lines}
        onChange={setLines}
      />
      <Textarea
        aria-label="验收备注"
        disabled={acceptMutation.isPending}
        maxLength={500}
        onChange={(event) => {
          setNote(event.target.value);
        }}
        placeholder="验收备注（选填）"
        value={note}
      />
      {error === null ? null : (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <div className="bg-background/95 pb-safe-bottom sticky bottom-0 -mx-4 border-t px-4 pt-3 backdrop-blur">
        <Button
          className="w-full"
          disabled={acceptMutation.isPending}
          onClick={() => {
            const message = validateChecklist(record.items, lines);

            if (message !== null) {
              setError(message);

              return;
            }

            setError(null);
            acceptMutation.mutate({
              id: record.id,
              items: toChecklistPayload(lines),
              note: note.trim().length === 0 ? null : note.trim(),
            });
          }}
          size="lg"
          type="button"
        >
          {acceptMutation.isPending ? "提交中…" : "确认接收"}
        </Button>
      </div>
    </div>
  );
};

interface HandoverPanelProps {
  record: RecordDetailDto;
  onDone: () => void;
  onGoAccept: () => void;
}

const HandoverPanel = ({ onDone, onGoAccept, record }: HandoverPanelProps) => {
  const [lines, setLines] = useState<ChecklistLine[]>(() =>
    buildChecklistLines(record.items)
  );

  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handoverMutation = useMutation({
    ...api.records.submitHandover.mutationOptions(),
    onSuccess: () => {
      toast.success("交班表已提交");
      onDone();
    },
  });

  if (!record.permissions.canHandover) {
    const hint = STATUS_HINTS[record.status];

    return (
      <div className="grid gap-3">
        <Alert>
          {record.status === "handover_submitted" ? (
            <CheckCircle2Icon />
          ) : (
            <ShieldAlertIcon />
          )}
          <AlertTitle>
            {record.status === "handover_submitted"
              ? "今日交班表已提交"
              : "暂时不能提交交班表"}
          </AlertTitle>
          <AlertDescription>{hint}</AlertDescription>
        </Alert>
        {record.status === "pending_acceptance" ? (
          <Button onClick={onGoAccept} type="button" variant="outline">
            <ClipboardCheckIcon />
            去做接班核对
          </Button>
        ) : null}
        {record.status === "handover_submitted" ? (
          <ul className="grid gap-2">
            {record.items.map((item) => (
              <li className="rounded-lg border p-3 text-sm" key={item.itemId}>
                <p className="font-medium break-words">{item.itemName}</p>
                <p className="text-muted-foreground text-xs">
                  交班实盘 {handoverActualLine(item)} · 应有 {item.expectedQty}{" "}
                  {item.unit}
                  {item.handoverNote === null
                    ? ""
                    : ` · 备注：${item.handoverNote}`}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {record.permissions.requiresExceptionReport ? (
        <Alert>
          <ShieldAlertIcon />
          <AlertTitle>存在数量差异，尚未异常上报</AlertTitle>
          <AlertDescription>
            交班表仍可提交，但建议先用物登记页完成异常上报，便于管理员跟进。
          </AlertDescription>
        </Alert>
      ) : null}
      <p className="text-muted-foreground text-xs">
        交班前请再次核对清单；实盘与应有数量不一致时必须填写备注。
      </p>
      <ChecklistForm
        disabled={handoverMutation.isPending}
        items={record.items}
        lines={lines}
        onChange={setLines}
      />
      <Textarea
        aria-label="交班备注"
        disabled={handoverMutation.isPending}
        maxLength={500}
        onChange={(event) => {
          setNote(event.target.value);
        }}
        placeholder="交班备注（选填）"
        value={note}
      />
      {error === null ? null : (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <div className="bg-background/95 pb-safe-bottom sticky bottom-0 -mx-4 border-t px-4 pt-3 backdrop-blur">
        <Button
          className="w-full"
          disabled={handoverMutation.isPending}
          onClick={() => {
            const message = validateChecklist(record.items, lines);

            if (message !== null) {
              setError(message);

              return;
            }

            setError(null);
            handoverMutation.mutate({
              id: record.id,
              items: toChecklistPayload(lines),
              note: note.trim().length === 0 ? null : note.trim(),
            });
          }}
          size="lg"
          type="button"
        >
          {handoverMutation.isPending ? "提交中…" : "提交交班表"}
        </Button>
      </div>
    </div>
  );
};

interface UsagePanelProps {
  data: MatterByTokenDto;
  operatorName: string;
  onDone: () => void;
  onGoAccept: () => void;
  record: RecordDetailDto;
}

const UsagePanel = ({
  data,
  onDone,
  onGoAccept,
  operatorName,
  record,
}: UsagePanelProps) => {
  const createMutation = useMutation({
    ...api.usage.create.mutationOptions(),
    onSuccess: () => {
      toast.success("用物登记成功，库存已扣减");
      onDone();
    },
  });

  if (record.status === "pending_acceptance") {
    return (
      <div className="grid gap-3">
        <Alert>
          <ClipboardCheckIcon />
          <AlertTitle>请先完成接班核对</AlertTitle>
          <AlertDescription>
            接班确认接收后才能登记用物消耗；如数量有异常，还需先提交异常上报。
          </AlertDescription>
        </Alert>
        <Button onClick={onGoAccept} type="button" variant="outline">
          <ClipboardCheckIcon />
          去做接班核对
        </Button>
      </div>
    );
  }

  if (record.permissions.requiresExceptionReport) {
    return <ExceptionReportForm onDone={onDone} record={record} />;
  }

  if (!record.permissions.canRegisterUsage) {
    return (
      <Alert>
        <ShieldAlertIcon />
        <AlertTitle>当前不能登记用物</AlertTitle>
        <AlertDescription>
          请先完成接班核对并处理数量差异，如有疑问请联系管理员。
        </AlertDescription>
      </Alert>
    );
  }

  if (data.items.length === 0) {
    return (
      <EmptyState
        description="该交接事项还没有物品，请联系管理员在物品库存中添加。"
        title="没有可用物品"
      />
    );
  }

  return (
    <UsageEntryForm
      defaultOperatorName={operatorName}
      items={data.items}
      onSubmit={(value: UsageEntryValue) => {
        createMutation.mutate({ matterId: data.matter.id, ...value });
      }}
      pending={createMutation.isPending}
      submitLabel="提交用物登记"
    />
  );
};

const ScanPage = () => {
  const { token } = Route.useParams();
  const me = useMe();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<ScanTab>(TAB_ACCEPT);

  const scanQuery = useQuery(
    api.matters.byToken.queryOptions({ input: { token } })
  );

  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: api.matters.byToken.queryKey({ input: { token } }),
    });
  };

  const goUsageAfterAccept = () => {
    setTab(TAB_USAGE);
    void scanQuery.refetch();
  };

  if (scanQuery.isPending) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-6">
        <PageSkeleton />
      </div>
    );
  }

  if (scanQuery.isError) {
    return (
      <div className="mx-auto flex min-h-svh w-full max-w-md flex-col px-4 py-6">
        <AppBrand />
        <div className="mt-8">
          <ErrorState
            description={scanQuery.error.message}
            onRetry={() => {
              void scanQuery.refetch();
            }}
            title="无法打开扫码页"
          />
        </div>
        <div className="mt-4">
          <ButtonLink href="/" size="sm" variant="outline">
            返回工作台
          </ButtonLink>
        </div>
      </div>
    );
  }

  const { data } = scanQuery;
  const { today } = data;
  const operatorName = me.data?.user.name ?? "";

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col">
      <header className="bg-background/90 sticky top-0 z-20 border-b px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <AppBrand />
          <StatusBadge status={today.status} />
        </div>
        <div className="mt-3 space-y-0.5">
          <h1 className="text-lg font-semibold tracking-tight break-words">
            {data.matter.name}
          </h1>
          <p className="text-muted-foreground text-xs">
            {data.team.name} · {formatRecordDate(today.recordDate)} ·{" "}
            {data.items.length} 种物品
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 py-4">
        <Tabs
          onValueChange={(value: string) => {
            if (isScanTab(value)) {
              setTab(value);
            }
          }}
          value={tab}
        >
          <TabsList className="w-full">
            <TabsTrigger value={TAB_ACCEPT}>接班核对</TabsTrigger>
            <TabsTrigger value={TAB_USAGE}>用物登记</TabsTrigger>
            <TabsTrigger value={TAB_HANDOVER}>交班表</TabsTrigger>
          </TabsList>
          <TabsContent value={TAB_ACCEPT}>
            <div className="pt-4">
              <AcceptPanel
                onAccepted={goUsageAfterAccept}
                onDone={refresh}
                record={today}
              />
            </div>
          </TabsContent>
          <TabsContent value={TAB_USAGE}>
            <div className="pt-4">
              <UsagePanel
                data={data}
                onDone={refresh}
                onGoAccept={() => {
                  setTab(TAB_ACCEPT);
                }}
                operatorName={operatorName}
                record={today}
              />
            </div>
          </TabsContent>
          <TabsContent value={TAB_HANDOVER}>
            <div className="pt-4">
              <HandoverPanel
                onDone={refresh}
                onGoAccept={() => {
                  setTab(TAB_ACCEPT);
                }}
                record={today}
              />
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <footer className="text-muted-foreground pb-safe-bottom border-t px-4 pt-3 text-center text-xs">
        <ScanLineIcon aria-hidden="true" className="mr-1 inline size-3.5" />
        扫码页仅显示当前交接事项，请勿分享链接
      </footer>
    </div>
  );
};

export const Route = createFileRoute("/scan/$token")({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({ search: { redirect: location.href }, to: "/login" });
    }
  },
  component: ScanPage,
});
