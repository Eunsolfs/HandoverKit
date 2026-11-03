import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { ChevronDownIcon, KeyRoundIcon, LogOutIcon } from "lucide-react";
import { useState } from "react";

import { Avatar, AvatarFallback } from "@handoverkit/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@handoverkit/ui/components/dropdown-menu";

import { ChangePasswordDialog } from "#src/components/app/change-password-dialog.tsx";
import { authClient } from "#src/lib/auth.ts";
import { ROLE_LABELS } from "#src/lib/roles.ts";
import type { AppRole } from "#src/lib/roles.ts";

interface UserMenuProps {
  name: string;
  role: AppRole;
  /** 侧边栏展示姓名与角色，顶栏只保留头像。 */
  variant?: "topbar" | "sidebar";
}

const TOPBAR_TRIGGER_CLASS =
  "hover:bg-muted flex size-9 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const SIDEBAR_TRIGGER_CLASS =
  "hover:bg-muted flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export const UserMenu = ({ name, role, variant = "topbar" }: UserMenuProps) => {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();

  const signOut = useMutation({
    mutationFn: async () => {
      await authClient.signOut();
    },
    onSuccess: async () => {
      queryClient.clear();
      await router.invalidate();
      await router.navigate({ to: "/login" });
    },
  });

  const initial = name.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <>
      <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
        <DropdownMenuTrigger
          render={
            variant === "sidebar" ? (
              <button
                aria-label="用户菜单"
                className={SIDEBAR_TRIGGER_CLASS}
                type="button"
              />
            ) : (
              <button
                aria-label="用户菜单"
                className={TOPBAR_TRIGGER_CLASS}
                type="button"
              />
            )
          }
        >
          <Avatar className="size-7">
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          {variant === "sidebar" ? (
            <span className="grid min-w-0 flex-1 text-left">
              <span className="truncate text-sm font-medium">{name}</span>
              <span className="text-muted-foreground truncate text-xs">
                {ROLE_LABELS[role]}
              </span>
            </span>
          ) : null}
          <ChevronDownIcon className="text-muted-foreground size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              {name} · {ROLE_LABELS[role]}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => {
                setPasswordOpen(true);
              }}
            >
              <KeyRoundIcon />
              修改密码
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                signOut.mutate();
              }}
              variant="destructive"
            >
              <LogOutIcon />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog
        onOpenChange={setPasswordOpen}
        open={passwordOpen}
      />
    </>
  );
};
