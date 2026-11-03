import { MenuIcon, QrCodeIcon } from "lucide-react";
import { useState } from "react";

import { Button, buttonVariants } from "@handoverkit/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@handoverkit/ui/components/sheet";

import { AppBrand } from "#src/components/app/app-brand.tsx";
import { AppLink } from "#src/components/app/app-link.tsx";
import { AppNav } from "#src/components/app/app-nav.tsx";
import { TeamSwitcher } from "#src/components/app/team-switcher.tsx";
import { UserMenu } from "#src/components/app/user-menu.tsx";
import { ModeToggle } from "#src/components/mode-toggle.tsx";
import type { ActiveTeamOption } from "#src/lib/active-team.tsx";
import type { AppRole } from "#src/lib/roles.ts";

interface AppTopbarProps {
  role: AppRole;
  title: string;
  userName: string;
  teams: ActiveTeamOption[];
}

export const AppTopbar = ({ role, teams, title, userName }: AppTopbarProps) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="bg-background/85 border-border sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-3 backdrop-blur sm:px-4 lg:px-6">
      <div className="flex items-center gap-1.5 lg:hidden">
        <Sheet onOpenChange={setMenuOpen} open={menuOpen}>
          <SheetTrigger
            render={
              <Button aria-label="打开导航菜单" size="icon" variant="ghost" />
            }
          >
            <MenuIcon />
          </SheetTrigger>
          <SheetContent className="w-[280px] max-w-[85vw]" side="left">
            <SheetTitle className="sr-only">导航菜单</SheetTitle>
            <SheetDescription className="sr-only">
              根据当前角色展示可访问的页面
            </SheetDescription>
            <div className="flex h-14 shrink-0 items-center px-4">
              <AppBrand />
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              <AppNav
                onNavigate={() => {
                  setMenuOpen(false);
                }}
                role={role}
              />
            </div>
            <div className="grid gap-2 border-t p-3">
              {role === "super_admin" ? <TeamSwitcher teams={teams} /> : null}
              <UserMenu name={userName} role={role} variant="sidebar" />
            </div>
          </SheetContent>
        </Sheet>
        <AppBrand />
      </div>

      <p className="hidden text-sm font-semibold lg:block">{title}</p>

      <div className="ml-auto flex items-center gap-1">
        {role === "super_admin" ? (
          <span className="hidden sm:block">
            <TeamSwitcher teams={teams} />
          </span>
        ) : null}
        <AppLink
          aria-label="打开扫码入口"
          className={buttonVariants({ size: "icon", variant: "ghost" })}
          href="/scan"
        >
          <QrCodeIcon />
        </AppLink>
        <span className="lg:hidden">
          <ModeToggle />
        </span>
        <span className="lg:hidden">
          <UserMenu name={userName} role={role} />
        </span>
      </div>
    </header>
  );
};
