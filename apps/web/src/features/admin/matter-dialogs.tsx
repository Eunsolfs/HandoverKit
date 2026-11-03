import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CopyIcon,
  DownloadIcon,
  PrinterIcon,
  RefreshCwIcon,
} from "lucide-react";
import { toDataURL, toString as qrToString } from "qrcode";
import { useState } from "react";
import type { ReactNode, SubmitEvent } from "react";
import { toast } from "sonner";

import { Button } from "@handoverkit/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@handoverkit/ui/components/dialog";
import { Input } from "@handoverkit/ui/components/input";
import { Skeleton } from "@handoverkit/ui/components/skeleton";
import { Textarea } from "@handoverkit/ui/components/textarea";

import { FormField } from "#src/components/app/form-field.tsx";
import { api } from "#src/lib/api.ts";
import { formatDateTime } from "#src/lib/format.ts";

import { isErrorLike, nullableText, optionalText } from "./shared.ts";
import type { MatterDto } from "./shared.ts";

interface MatterFormErrors {
  name?: string;
  code?: string;
  form?: string;
}

interface MatterFormDialogProps {
  onOpenChange: (open: boolean) => void;
  /** null 表示新建交接事项。 */
  matter: MatterDto | null;
}

export const MatterFormDialog = ({
  matter,
  onOpenChange,
}: MatterFormDialogProps) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState(matter?.name ?? "");
  const [code, setCode] = useState(matter?.code ?? "");
  const [description, setDescription] = useState(matter?.description ?? "");
  const [errors, setErrors] = useState<MatterFormErrors>({});

  const refreshMatters = () => {
    void queryClient.invalidateQueries({
      queryKey: api.matters.key({ type: "query" }),
    });
    void queryClient.invalidateQueries({
      queryKey: api.me.key({ type: "query" }),
    });
  };

  const createMatter = useMutation({
    ...api.matters.create.mutationOptions(),
    onError: (error) => {
      setErrors({
        form: isErrorLike(error) ? error.message : "交接事项创建失败，请重试",
      });
    },
    onSuccess: () => {
      toast.success("交接事项已创建");
      refreshMatters();
      onOpenChange(false);
    },
  });

  const updateMatter = useMutation({
    ...api.matters.update.mutationOptions(),
    onError: (error) => {
      setErrors({
        form: isErrorLike(error) ? error.message : "交接事项更新失败，请重试",
      });
    },
    onSuccess: () => {
      toast.success("交接事项已更新");
      refreshMatters();
      onOpenChange(false);
    },
  });

  const pending = createMatter.isPending || updateMatter.isPending;

  const validate = (): boolean => {
    const next: MatterFormErrors = {};

    if (name.trim().length === 0) {
      next.name = "请输入交接事项名称";
    } else if (name.trim().length > 60) {
      next.name = "名称最多 60 个字符";
    }

    if (code.trim().length > 30) {
      next.code = "编码最多 30 个字符";
    }

    setErrors(next);

    return Object.keys(next).length === 0;
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    if (matter === null) {
      createMatter.mutate({
        code: optionalText(code),
        description: optionalText(description),
        name: name.trim(),
      });

      return;
    }

    updateMatter.mutate({
      code: nullableText(code),
      description: nullableText(description),
      id: matter.id,
      name: name.trim(),
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {matter === null ? "新建交接事项" : "编辑交接事项"}
          </DialogTitle>
          <DialogDescription>
            每个交接事项对应一个独立的用物仓库与二维码。
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" noValidate onSubmit={handleSubmit}>
          {errors.form === undefined ? null : (
            <p className="text-destructive text-sm" role="alert">
              {errors.form}
            </p>
          )}

          <FormField
            error={errors.name}
            id="matter-name"
            label="事项名称"
            required
          >
            {(field) => (
              <Input
                {...field}
                disabled={pending}
                maxLength={60}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                placeholder="例如 急诊抢救车"
                value={name}
              />
            )}
          </FormField>

          <FormField
            error={errors.code}
            hint="选填，便于线下登记核对，同一团队内不可重复"
            id="matter-code"
            label="事项编码"
          >
            {(field) => (
              <Input
                {...field}
                disabled={pending}
                maxLength={30}
                onChange={(event) => {
                  setCode(event.target.value);
                }}
                placeholder="例如 RESCUE-01"
                value={code}
              />
            )}
          </FormField>

          <FormField id="matter-description" label="描述">
            {(field) => (
              <Textarea
                {...field}
                disabled={pending}
                maxLength={300}
                onChange={(event) => {
                  setDescription(event.target.value);
                }}
                placeholder="选填，例如存放位置、责任人"
                value={description}
              />
            )}
          </FormField>

          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => {
                onOpenChange(false);
              }}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button disabled={pending} type="submit">
              {pending ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const qrImageQueryKey = ["admin", "matter-qr"] as const;

interface MatterQrPanelProps {
  matter: MatterDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 二次确认由页面负责，确认后调用 matters.rotateQr。 */
  onRequestRotate: () => void;
}

export const MatterQrPanel = ({
  matter,
  onOpenChange,
  onRequestRotate,
  open,
}: MatterQrPanelProps) => {
  const qrToken = matter?.qrToken ?? null;

  const content =
    qrToken === null ? "" : `${window.location.origin}/scan/${qrToken}`;

  const qrQuery = useQuery({
    queryKey: [...qrImageQueryKey, qrToken],
    queryFn: async () => {
      if (qrToken === null) {
        throw new Error("缺少二维码 token");
      }

      const text = `${window.location.origin}/scan/${qrToken}`;

      const [png, svg] = await Promise.all([
        toDataURL(text, { errorCorrectionLevel: "M", margin: 2, width: 512 }),
        qrToString(text, {
          errorCorrectionLevel: "M",
          margin: 2,
          type: "svg",
          width: 512,
        }),
      ]);

      return { png, svg };
    },
    enabled: open && qrToken !== null,
    gcTime: 0,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { data } = qrQuery;
  const generating = qrQuery.isPending || qrQuery.isFetching;

  let qrBody: ReactNode;

  if (generating) {
    qrBody = <Skeleton className="size-56" />;
  } else if (data === undefined) {
    qrBody = (
      <div className="flex size-56 items-center justify-center px-4 text-center">
        <p className="text-muted-foreground text-sm">
          {qrQuery.isError ? "二维码生成失败，请点击重试" : "二维码尚未生成"}
        </p>
      </div>
    );
  } else {
    qrBody = (
      <img
        alt="交接事项二维码"
        className="size-56"
        height={512}
        src={data.png}
        width={512}
      />
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("扫码链接已复制");
    } catch {
      toast.error("复制失败，请手动选择链接复制");
    }
  };

  const handleDownloadPng = () => {
    if (data === undefined || matter === null) {
      return;
    }

    const link = document.createElement("a");
    link.href = data.png;
    link.download = `交接二维码-${matter.name}.png`;
    document.body.append(link);
    link.click();
    link.remove();
  };

  const handleDownloadSvg = () => {
    if (data === undefined || matter === null) {
      return;
    }

    const blob = new Blob([data.svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `交接二维码-${matter.name}.svg`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (data === undefined || matter === null) {
      return;
    }

    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.position = "fixed";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    document.body.append(frame);

    const frameDoc = frame.contentDocument;

    if (frameDoc === null) {
      frame.remove();
      toast.error("当前浏览器无法打开打印视图，请下载二维码后打印");

      return;
    }

    const title = frameDoc.createElement("h1");
    title.textContent = matter.name;
    title.style.fontSize = "18px";
    title.style.fontFamily = "sans-serif";

    const image = frameDoc.createElement("img");
    image.src = data.png;
    image.alt = "交接事项二维码";
    image.style.width = "320px";
    image.style.height = "320px";

    const link = frameDoc.createElement("p");
    link.textContent = content;
    link.style.wordBreak = "break-all";
    link.style.fontSize = "12px";
    link.style.fontFamily = "sans-serif";

    frameDoc.body.append(title, image, link);
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => {
      frame.remove();
    }, 1000);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>事项二维码</DialogTitle>
          <DialogDescription>
            {matter === null
              ? "选择交接事项后展示二维码。"
              : `${matter.name} · 版本 v${matter.qrVersion}，最近变更 ${formatDateTime(matter.qrChangedAt)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid justify-items-center gap-3">
          <div className="bg-white p-3">{qrBody}</div>

          {qrQuery.isError ? (
            <Button
              onClick={() => {
                void qrQuery.refetch();
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCwIcon />
              重新生成二维码
            </Button>
          ) : null}

          <div className="grid w-full gap-1">
            <p className="text-muted-foreground text-xs">扫码链接</p>
            <p className="bg-muted/60 rounded-md px-2 py-1.5 font-mono text-xs break-all">
              {content}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Button
            disabled={data === undefined}
            onClick={handleDownloadPng}
            size="sm"
            type="button"
            variant="outline"
          >
            <DownloadIcon />
            下载 PNG
          </Button>
          <Button
            disabled={data === undefined}
            onClick={handleDownloadSvg}
            size="sm"
            type="button"
            variant="outline"
          >
            <DownloadIcon />
            下载 SVG
          </Button>
          <Button
            disabled={data === undefined}
            onClick={handlePrint}
            size="sm"
            type="button"
            variant="outline"
          >
            <PrinterIcon />
            打印
          </Button>
          <Button
            className="col-span-2 sm:col-span-1"
            onClick={() => {
              void handleCopy();
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <CopyIcon />
            复制链接
          </Button>
        </div>

        <div className="border-destructive/30 bg-destructive/5 grid gap-2 rounded-lg border p-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">申请变更二维码</p>
            <p className="text-muted-foreground text-xs text-pretty">
              生成新二维码后，已张贴的旧二维码与旧链接立即失效，需要重新打印张贴。
            </p>
          </div>
          <Button
            className="w-fit"
            onClick={onRequestRotate}
            size="sm"
            type="button"
            variant="destructive"
          >
            申请变更二维码
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
