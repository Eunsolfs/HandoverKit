import { useRouter, useRouterState } from "@tanstack/react-router";
import type { MouseEvent, ReactNode } from "react";

import { navItemMatches } from "#src/lib/nav.ts";

interface AppLinkProps {
  href: string;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  "aria-current"?: "page";
  /** 点击后执行（移动端抽屉导航需要收起抽屉）。 */
  onNavigate?: () => void;
}

const isPlainLeftClick = (event: MouseEvent<HTMLAnchorElement>): boolean =>
  event.button === 0 &&
  !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);

/**
 * 导航使用 href 而不是强类型 to：管理端路由由 frontend-admin 并行开发，
 * 导航配置以路径字符串表达，避免两条前端路由线互相阻塞类型检查。
 */
export const AppLink = ({
  "aria-current": ariaCurrent,
  "aria-label": ariaLabel,
  children,
  className,
  href,
  onNavigate,
}: AppLinkProps) => {
  const router = useRouter();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainLeftClick(event)) {
      return;
    }

    event.preventDefault();
    onNavigate?.();
    void router.navigate({ href });
  };

  return (
    <a
      aria-current={ariaCurrent}
      aria-label={ariaLabel}
      className={className}
      href={href}
      onClick={handleClick}
    >
      {children}
    </a>
  );
};

export const useIsPathActive = (path: string): boolean => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return navItemMatches(path, pathname);
};

export const useCurrentPathname = (): string =>
  useRouterState({ select: (state) => state.location.pathname });
