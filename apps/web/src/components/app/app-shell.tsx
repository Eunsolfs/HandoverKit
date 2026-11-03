import { Outlet } from "@tanstack/react-router";

import { Skeleton } from "@handoverkit/ui/components/skeleton";

import { useCurrentPathname } from "#src/components/app/app-link.tsx";
import { AppSidebar } from "#src/components/app/app-sidebar.tsx";
import { AppTopbar } from "#src/components/app/app-topbar.tsx";
import { ErrorState } from "#src/components/app/error-state.tsx";
import { PageSkeleton } from "#src/components/app/loading.tsx";
import { ActiveTeamProvider, useActiveTeam } from "#src/lib/active-team.tsx";
import type { ActiveTeamOption } from "#src/lib/active-team.tsx";
import { useMe } from "#src/lib/me.ts";
import { findNavItemByPath, SKIP_TO_CONTENT_ID } from "#src/lib/nav.ts";
import { toAppRole } from "#src/lib/roles.ts";
import type { AppRole } from "#src/lib/roles.ts";

const ShellSkeleton = () => (
  <div className="min-h-svh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
    <div className="bg-sidebar border-border hidden border-r lg:block" />
    <div className="flex min-h-svh flex-col">
      <div className="border-border flex h-14 items-center border-b px-4">
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <PageSkeleton />
      </div>
    </div>
  </div>
);

interface AppShellFrameProps {
  role: AppRole;
  teams: ActiveTeamOption[];
  userName: string;
  fallbackTeamName: string | null;
}

const AppShellFrame = ({
  fallbackTeamName,
  role,
  teams,
  userName,
}: AppShellFrameProps) => {
  const pathname = useCurrentPathname();
  const { activeTeamId } = useActiveTeam();
  const title = findNavItemByPath(pathname)?.label ?? "易交接";

  const teamName =
    teams.find((team) => team.id === activeTeamId)?.name ?? fallbackTeamName;

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <a
        className="bg-background sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-3 focus:py-2 focus:text-sm"
        href={`#${SKIP_TO_CONTENT_ID}`}
      >
        跳到主要内容
      </a>
      <AppSidebar role={role} teamName={teamName} userName={userName} />
      <div className="flex min-h-svh flex-col">
        <AppTopbar
          role={role}
          teams={teams}
          title={title}
          userName={userName}
        />
        <main
          className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-6 lg:px-8"
          id={SKIP_TO_CONTENT_ID}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
};

/** 应用外壳：先取当前用户资料（含团队/事项），再渲染侧边栏与顶栏。 */
export const AppShell = () => {
  const me = useMe();

  if (me.isPending) {
    return <ShellSkeleton />;
  }

  if (me.isError) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16">
        <ErrorState
          description={me.error.message}
          onRetry={() => {
            void me.refetch();
          }}
          title="无法加载账号信息"
        />
      </div>
    );
  }

  const { team, teams, user } = me.data;
  const role = toAppRole(user.role);

  const teamOptions: ActiveTeamOption[] = teams.map((option) => ({
    id: option.id,
    name: option.name,
  }));

  const defaultTeamId = user.teamId ?? team?.id ?? null;

  return (
    <ActiveTeamProvider
      allowSwitch={role === "super_admin"}
      defaultTeamId={defaultTeamId}
      teams={teamOptions}
    >
      <AppShellFrame
        fallbackTeamName={team?.name ?? null}
        role={role}
        teams={teamOptions}
        userName={user.name}
      />
    </ActiveTeamProvider>
  );
};
