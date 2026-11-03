import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  CameraIcon,
  LogInIcon,
  QrCodeIcon,
  ScanLineIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@handoverkit/ui/components/card";

import { AppLink } from "#src/components/app/app-link.tsx";
import { EmptyState } from "#src/components/app/empty-state.tsx";
import { ErrorState } from "#src/components/app/error-state.tsx";
import { PageSkeleton } from "#src/components/app/loading.tsx";
import { PageHeader } from "#src/components/app/page-header.tsx";
import { useActiveTeam } from "#src/lib/active-team.tsx";
import { api } from "#src/lib/api.ts";
import { useMe } from "#src/lib/me.ts";

const STEPS: { icon: LucideIcon; title: string; description: string }[] = [
  {
    description: "使用手机相机或微信扫一扫，扫描张贴在科室的交接事项二维码。",
    icon: CameraIcon,
    title: "扫描二维码",
  },
  {
    description:
      "未登录时先跳转到登录页，登录成功后自动回到扫码页，不会丢失链接。",
    icon: LogInIcon,
    title: "登录后自动回跳",
  },
  {
    description: "在扫码页完成接班核对、用物消耗登记与交班表提交。",
    icon: ScanLineIcon,
    title: "完成三件事",
  },
];

const ScanGuidePage = () => {
  const me = useMe();
  const { activeTeamId } = useActiveTeam();

  const mattersQuery = useQuery({
    ...api.matters.list.queryOptions({
      input: { teamId: activeTeamId ?? undefined },
    }),
    enabled: activeTeamId !== null,
  });

  if (me.isPending || mattersQuery.isPending) {
    return <PageSkeleton />;
  }

  if (me.isError || mattersQuery.isError) {
    return (
      <ErrorState
        error={me.isError ? me.error : (mattersQuery.error ?? undefined)}
        onRetry={() => {
          void me.refetch();
          void mattersQuery.refetch();
        }}
      />
    );
  }

  const matters = mattersQuery.data;

  return (
    <div className="grid gap-6">
      <PageHeader
        description="系统不内置摄像头：用手机相机扫描交接事项的固定二维码即可进入扫码页"
        title="扫码入口"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <Card key={step.title} size="sm">
            <CardHeader>
              <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
                <step.icon aria-hidden="true" className="size-4" />
              </span>
              <CardTitle>
                {index + 1}. {step.title}
              </CardTitle>
              <CardDescription>{step.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>在电脑上打开扫码页</CardTitle>
          <CardDescription>
            调试或手机不便时，可直接从下方列表打开对应交接事项的扫码页。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {matters.length === 0 ? (
            <EmptyState
              description="交接事项创建后，这里会列出可直接打开的扫码页链接。"
              icon={QrCodeIcon}
              title="当前团队还没有交接事项"
            />
          ) : (
            <ul className="divide-y">
              {matters.map((matter) => (
                <li
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  key={matter.id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {matter.name}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      二维码版本 v{matter.qrVersion}
                    </p>
                  </div>
                  <AppLink
                    className="text-primary focus-visible:ring-ring inline-flex items-center gap-1 rounded-md text-xs font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
                    href={`/scan/${matter.qrToken}`}
                  >
                    打开扫码页
                    <ArrowRightIcon className="size-3.5" />
                  </AppLink>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export const Route = createFileRoute("/_app/scan")({
  component: ScanGuidePage,
});
