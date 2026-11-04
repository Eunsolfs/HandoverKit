import {
  BarChart3Icon,
  BoxesIcon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  QrCodeIcon,
  UsersIcon,
  UsersRoundIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { isAdminRole } from "#src/lib/roles.ts";
import type { AppRole } from "#src/lib/roles.ts";

export interface AppNavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export interface AppNavSection {
  label: string;
  items: AppNavItem[];
}

const businessSection: AppNavSection = {
  label: "业务",
  items: [
    { icon: LayoutDashboardIcon, label: "工作台", path: "/" },
    { icon: ClipboardListIcon, label: "交接记录", path: "/records" },
    { icon: BoxesIcon, label: "用物消耗", path: "/usage" },
    { icon: QrCodeIcon, label: "扫码入口", path: "/scan" },
  ],
};

/** 管理端页面由 frontend-admin 实现；这里只约定导航路径，扩展时改这一处。 */
const adminSection: AppNavSection = {
  label: "管理",
  items: [
    { icon: BoxesIcon, label: "物品库存", path: "/admin/items" },
    { icon: BarChart3Icon, label: "数据统计", path: "/admin/stats" },
    { icon: QrCodeIcon, label: "事项二维码", path: "/admin/matters" },
  ],
};

const platformSection: AppNavSection = {
  label: "系统",
  items: [
    { icon: UsersRoundIcon, label: "团队管理", path: "/admin/teams" },
    { icon: UsersIcon, label: "用户管理", path: "/admin/users" },
  ],
};

const usersSection: AppNavSection = {
  label: "系统",
  items: [{ icon: UsersIcon, label: "用户管理", path: "/admin/users" }],
};

const allItems = [
  ...businessSection.items,
  ...adminSection.items,
  ...platformSection.items,
];

export const navSectionsForRole = (role: AppRole): AppNavSection[] => {
  if (!isAdminRole(role)) {
    return [businessSection];
  }

  if (role === "super_admin") {
    return [businessSection, adminSection, platformSection];
  }

  return [businessSection, adminSection, usersSection];
};

export const navItemMatches = (path: string, pathname: string): boolean =>
  path === "/"
    ? pathname === "/"
    : pathname === path || pathname.startsWith(`${path}/`);

/** 顶栏标题取自导航配置，保证菜单名与页面标题一致。 */
export const findNavItemByPath = (pathname: string): AppNavItem | undefined => {
  const candidates = allItems.filter((item) =>
    navItemMatches(item.path, pathname)
  );

  return candidates.toSorted(
    (left, right) => right.path.length - left.path.length
  )[0];
};

export const SKIP_TO_CONTENT_ID = "app-main-content";
