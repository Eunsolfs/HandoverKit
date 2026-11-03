import { AppBrand } from "#src/components/app/app-brand.tsx";
import { AppNav } from "#src/components/app/app-nav.tsx";
import { UserMenu } from "#src/components/app/user-menu.tsx";
import { ModeToggle } from "#src/components/mode-toggle.tsx";
import type { AppRole } from "#src/lib/roles.ts";

interface AppSidebarProps {
  role: AppRole;
  userName: string;
  teamName: string | null;
}

export const AppSidebar = ({ role, teamName, userName }: AppSidebarProps) => (
  <aside className="bg-sidebar border-sidebar-border sticky top-0 hidden h-svh w-[248px] shrink-0 flex-col border-r lg:flex">
    <div className="flex h-14 shrink-0 items-center px-4">
      <AppBrand />
    </div>
    <div className="flex-1 overflow-y-auto px-3 py-2">
      <AppNav role={role} />
    </div>
    <div className="border-sidebar-border grid shrink-0 gap-2 border-t p-3">
      <p className="text-muted-foreground truncate px-2 text-xs">
        当前团队：{teamName ?? "未加入团队"}
      </p>
      <UserMenu name={userName} role={role} variant="sidebar" />
      <div className="flex items-center justify-between px-1">
        <span className="text-muted-foreground text-xs">主题</span>
        <ModeToggle />
      </div>
    </div>
  </aside>
);
