import { cn } from "@handoverkit/ui/lib/utils";

import { AppLink, useIsPathActive } from "#src/components/app/app-link.tsx";
import { navSectionsForRole } from "#src/lib/nav.ts";
import type { AppNavItem } from "#src/lib/nav.ts";
import type { AppRole } from "#src/lib/roles.ts";

interface AppNavItemLinkProps {
  item: AppNavItem;
  onNavigate?: () => void;
}

const AppNavItemLink = ({ item, onNavigate }: AppNavItemLinkProps) => {
  const active = useIsPathActive(item.path);
  const Icon = item.icon;

  return (
    <AppLink
      aria-current={active ? "page" : undefined}
      className={cn(
        "focus-visible:ring-sidebar-ring flex h-11 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none lg:h-9",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      )}
      href={item.path}
      onNavigate={onNavigate}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </AppLink>
  );
};

interface AppNavProps {
  role: AppRole;
  onNavigate?: () => void;
}

export const AppNav = ({ onNavigate, role }: AppNavProps) => {
  const sections = navSectionsForRole(role);

  return (
    <nav aria-label="主导航" className="grid gap-4">
      {sections.map((section) => (
        <div className="grid gap-1" key={section.label}>
          <p className="text-muted-foreground px-2 text-xs font-medium tracking-wide">
            {section.label}
          </p>
          {section.items.map((item) => (
            <AppNavItemLink
              item={item}
              key={item.path}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </nav>
  );
};
