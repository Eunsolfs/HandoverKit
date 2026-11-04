import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  BoxesIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  FileCheck2Icon,
  PlusIcon,
  QrCodeIcon,
  SparklesIcon,
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
import { ButtonLink } from "#src/components/app/button-link.tsx";
import { EmptyState } from "#src/components/app/empty-state.tsx";
import { ErrorState } from "#src/components/app/error-state.tsx";
import { PageSkeleton } from "#src/components/app/loading.tsx";
import { PageHeader } from "#src/components/app/page-header.tsx";
import { StatCard } from "#src/components/app/stat-card.tsx";
import { StatusBadge } from "#src/components/app/status-badge.tsx";
import { useActiveTeam } from "#src/lib/active-team.tsx";
import { api } from "#src/lib/api.ts";
import { formatFullToday, toLocalDateString } from "#src/lib/format.ts";
import { useMe } from "#src/lib/me.ts";
import { isAdminRole, toAppRole } from "#src/lib/roles.ts";
import type { AppRole } from "#src/lib/roles.ts";

type MatterSummary = Awaited<ReturnType<typeof api.matters.list.call>>[number];

type TeamSummary = NonNullable<
  Awaited<ReturnType<typeof api.me.get.call>>["team"]
>;

type TodayStatus = Awaited<
  ReturnType<typeof api.matters.todayStatuses.call>
>[number];

interface QuickAction {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    description: "逐项核对当日清单并确认接收",
    href: "/records",
    icon: ClipboardCheckIcon,
    title: "接班核对",
  },
  {
    description: "登记患者使用物品，自动扣减库存",
    href: "/usage",
    icon: BoxesIcon,
    title: "用物登记",
  },
  {
    description: "再次核对并提交用物交接表",
    href: "/records",
    icon: FileCheck2Icon,
    title: "交班表",
  },
];

const countStatus = (matters: MatterSummary[], status: string): number =>
  matters.filter((matter) => matter.todayStatus === status).length;

interface MetricCardsProps {
  admin: boolean;
  matters: MatterSummary[];
  team: TeamSummary | null;
  today: string;
  usageCount: number;
}

const MetricCards = ({
  admin,
  matters,
  team,
  today,
  usageCount,
}: MetricCardsProps) => (
  <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
    <AppLink
      className="focus-visible:ring-ring block rounded-xl focus-visible:ring-2 focus-visible:outline-none"
      href={admin ? "/admin/matters" : "/records"}
    >
      <StatCard
        hint={team === null ? undefined : team.code}
        icon={QrCodeIcon}
        label="交接事项"
        value={matters.length}
      />
    </AppLink>
    <AppLink
      className="focus-visible:ring-ring block rounded-xl focus-visible:ring-2 focus-visible:outline-none"
      href="/records"
    >
      <StatCard
        hint="今日待核对清单"
        icon={ClipboardCheckIcon}
        label="待接收"
        tone="warning"
        value={countStatus(matters, "pending_acceptance")}
      />
    </AppLink>
    <AppLink
      className="focus-visible:ring-ring block rounded-xl focus-visible:ring-2 focus-visible:outline-none"
      href="/records"
    >
      <StatCard
        hint="今日已提交交班表"
        icon={FileCheck2Icon}
        label="今日已交班"
        tone="success"
        value={countStatus(matters, "handover_submitted")}
      />
    </AppLink>
    <AppLink
      className="focus-visible:ring-ring block rounded-xl focus-visible:ring-2 focus-visible:outline-none"
      href="/usage"
    >
      <StatCard
        hint={`今日 ${today}`}
        icon={BoxesIcon}
        label="今日用物记录"
        tone="info"
        value={usageCount}
      />
    </AppLink>
  </div>
);

interface TodayCardProps {
  matters: MatterSummary[];
  admin: boolean;
  teamName: string | null;
}

const TodayCard = ({ admin, matters, teamName }: TodayCardProps) => (
  <Card className="lg:col-span-2">
    <CardHeader>
      <CardTitle>今日交接</CardTitle>
      <CardDescription>
        {teamName === null ? "当日清单状态" : `${teamName} · 当日清单状态`}
      </CardDescription>
    </CardHeader>
    <CardContent>
      {matters.length === 0 ? (
        <EmptyState
          action={
            admin ? (
              <ButtonLink href="/admin/matters" size="sm" variant="outline">
                <PlusIcon />
                创建交接事项
              </ButtonLink>
            ) : null
          }
          description={
            admin
              ? "创建交接事项后即可生成当日清单并张贴二维码。"
              : "请联系团队管理员创建交接事项。"
          }
          title="当前团队还没有交接事项"
        />
      ) : (
        <ul className="divide-y">
          {matters.map((matter) => (
            <li
              className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
              key={matter.id}
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate text-sm font-medium">{matter.name}</p>
                <p className="text-muted-foreground flex flex-wrap gap-x-1 text-xs">
                  {matter.code === null ? null : (
                    <span>编码 {matter.code}</span>
                  )}
                  <span>
                    {matter.itemCount > 0
                      ? `${matter.itemCount} 种物品`
                      : "暂无物品"}
                  </span>
                </p>
              </div>
              {matter.todayStatus === null ? (
                <StatusBadge
                  label="待生成"
                  status="pending_acceptance"
                  tone="neutral"
                />
              ) : (
                <StatusBadge status={matter.todayStatus} />
              )}
              <AppLink
                className="text-primary focus-visible:ring-ring inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-xs font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none lg:min-h-0 lg:px-0"
                href={`/records?matterId=${matter.id}`}
              >
                查看记录
                <ArrowRightIcon className="size-3.5" />
              </AppLink>
            </li>
          ))}
        </ul>
      )}
    </CardContent>
  </Card>
);

const SubWarehouseTodayCard = ({ statuses }: { statuses: TodayStatus[] }) => (
  <Card>
    <CardHeader>
      <CardTitle>子仓库今日状态</CardTitle>
      <CardDescription>
        按门诊 / 住院等子仓库查看今日清点与交班进度，点击卡片进入扫码页
      </CardDescription>
    </CardHeader>
    <CardContent>
      {statuses.length === 0 ? (
        <EmptyState
          description="当前团队还没有启用中的子仓库。"
          title="暂无子仓库状态"
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {statuses.map((status) => (
            <AppLink
              className="focus-visible:ring-ring hover:bg-accent/60 flex flex-col gap-1 rounded-lg border p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
              href={`/scan/${status.qrToken}?subWarehouseId=${encodeURIComponent(status.subWarehouseId)}`}
              key={status.subWarehouseId}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground truncate text-xs">
                  {status.matterName}
                  {status.matterCode === null ? "" : ` · ${status.matterCode}`}
                </span>
                {status.status === null ? (
                  <StatusBadge
                    label="未开始"
                    status="pending_acceptance"
                    tone="neutral"
                  />
                ) : (
                  <StatusBadge status={status.status} />
                )}
              </div>
              <span className="truncate text-sm font-medium">
                {status.subWarehouseName}
              </span>
              <span className="text-muted-foreground text-xs">
                {status.itemCount} 种物品 · 点击进入扫码页
              </span>
            </AppLink>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
);

const QuickActionsCard = () => (
  <Card>
    <CardHeader>
      <CardTitle>快捷操作</CardTitle>
      <CardDescription>常用操作入口</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="grid gap-2">
        {QUICK_ACTIONS.map((action) => (
          <AppLink
            className="group focus-visible:ring-ring hover:bg-accent/60 flex items-center gap-3 rounded-lg border p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
            href={action.href}
            key={action.title}
          >
            <span
              aria-hidden="true"
              className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg"
            >
              <action.icon className="size-4" />
            </span>
            <span className="grid min-w-0 gap-0.5">
              <span className="text-sm font-medium">{action.title}</span>
              <span className="text-muted-foreground line-clamp-2 text-xs">
                {action.description}
              </span>
            </span>
            <ArrowRightIcon className="text-muted-foreground ml-auto size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </AppLink>
        ))}
      </div>
    </CardContent>
  </Card>
);

const AdminEntryCard = ({ role }: { role: AppRole }) => (
  <Card>
    <CardHeader>
      <CardTitle>管理入口</CardTitle>
      <CardDescription>物品、统计与交接事项维护</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/admin/items" size="sm" variant="outline">
          <BoxesIcon />
          物品库存
        </ButtonLink>
        <ButtonLink href="/admin/stats" size="sm" variant="outline">
          <ClipboardListIcon />
          数据统计
        </ButtonLink>
        <ButtonLink href="/admin/matters" size="sm" variant="outline">
          <QrCodeIcon />
          事项二维码
        </ButtonLink>
        {role === "super_admin" ? (
          <ButtonLink href="/admin/teams" size="sm" variant="outline">
            <SparklesIcon />
            团队管理
          </ButtonLink>
        ) : null}
      </div>
    </CardContent>
  </Card>
);

const WorkbenchPage = () => {
  const { activeTeamId } = useActiveTeam();
  const me = useMe(activeTeamId);
  const today = toLocalDateString();
  const teamId = activeTeamId;
  const queriesEnabled = teamId !== null;

  const mattersQuery = useQuery({
    ...api.matters.list.queryOptions({
      input: { teamId: teamId ?? undefined },
    }),
    enabled: queriesEnabled,
  });

  const todayStatusesQuery = useQuery({
    ...api.matters.todayStatuses.queryOptions({
      input: { teamId: teamId ?? undefined },
    }),
    enabled: queriesEnabled,
  });

  const usageTodayQuery = useQuery({
    ...api.usage.list.queryOptions({
      input: {
        from: today,
        page: 1,
        pageSize: 1,
        teamId: teamId ?? undefined,
        to: today,
      },
    }),
    enabled: queriesEnabled,
  });

  if (me.isPending) {
    return <PageSkeleton />;
  }

  if (me.isError) {
    return (
      <ErrorState
        error={me.error}
        onRetry={() => {
          void me.refetch();
        }}
      />
    );
  }

  const { team, teams, user } = me.data;
  const role = toAppRole(user.role);
  const admin = isAdminRole(role);

  const noTeam =
    role === "super_admin" ? teams.length === 0 : me.data.user.teamId === null;

  if (!noTeam && mattersQuery.isPending) {
    return <PageSkeleton />;
  }

  if (!noTeam && mattersQuery.isError) {
    return (
      <ErrorState
        error={mattersQuery.error}
        onRetry={() => {
          void mattersQuery.refetch();
        }}
      />
    );
  }

  const matters = mattersQuery.data ?? [];
  const usageTodayCount = usageTodayQuery.data?.total ?? 0;

  return (
    <div className="grid gap-6">
      <PageHeader
        actions={
          <ButtonLink href="/scan" size="sm" variant="outline">
            <QrCodeIcon />
            扫码入口
          </ButtonLink>
        }
        description={`${formatFullToday()} · 欢迎回来，${user.name}`}
        title="工作台"
      />

      {noTeam ? (
        <EmptyState
          action={
            admin ? (
              <ButtonLink href="/admin/teams" size="sm">
                <PlusIcon />
                创建团队
              </ButtonLink>
            ) : null
          }
          description={
            admin
              ? "超级管理员需要先创建团队，才能管理成员、交接事项与物品库存。"
              : "账号还没有加入团队，请联系管理员分配团队后再使用。"
          }
          icon={SparklesIcon}
          title="还没有可用团队"
        />
      ) : (
        <>
          <MetricCards
            admin={admin}
            matters={matters}
            team={team}
            today={today}
            usageCount={usageTodayCount}
          />
          <SubWarehouseTodayCard statuses={todayStatusesQuery.data ?? []} />
          <div className="grid gap-4 lg:grid-cols-3">
            <TodayCard
              admin={admin}
              matters={matters}
              teamName={team === null ? null : team.name}
            />
            <QuickActionsCard />
          </div>
          {admin ? <AdminEntryCard role={role} /> : null}
        </>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_app/")({
  component: WorkbenchPage,
});
