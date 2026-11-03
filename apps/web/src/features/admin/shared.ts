import type { InferClientOutputs } from "@orpc/client";

import type { AppRouterClient } from "@handoverkit/api";

import { useActiveTeam } from "#src/lib/active-team.tsx";
import { useMe } from "#src/lib/me.ts";
import { ROLE_LABELS } from "#src/lib/roles.ts";
import type { AppRole } from "#src/lib/roles.ts";

type ClientOutputs = InferClientOutputs<AppRouterClient>;

/** 管理端 DTO 直接来自 oRPC 客户端类型，避免前端手写重复结构。 */
export type TeamDto = ClientOutputs["teams"]["list"][number];

export type ProfileDto = ClientOutputs["users"]["list"][number];

export type MatterDto = ClientOutputs["matters"]["list"][number];

export type ItemDto = ClientOutputs["items"]["list"][number];

export type StockMovementDto = ClientOutputs["items"]["movements"][number];

export type StatsOverviewDto = ClientOutputs["stats"]["overview"];

export type StatsPeriod = StatsOverviewDto["range"]["period"];

export interface RoleOption {
  label: string;
  value: "team_admin" | "member";
}

/** users.create/update 只允许团队管理员与普通成员两种目标角色。 */
export const creatableRoles = (role: AppRole): RoleOption[] =>
  role === "super_admin"
    ? [
        { label: ROLE_LABELS.team_admin, value: "team_admin" },
        { label: ROLE_LABELS.member, value: "member" },
      ]
    : [{ label: ROLE_LABELS.member, value: "member" }];

export const isErrorLike = (value: unknown): value is Error =>
  value instanceof Error;

/**
 * 管理端页面统一取「当前团队」：超级管理员跟随顶栏的团队切换器，
 * 团队管理员固定为自己的团队。
 */
export const useAdminTeamId = (): string | null => {
  const me = useMe();
  const { activeTeamId } = useActiveTeam();

  return activeTeamId ?? me.data?.user.teamId ?? null;
};

export const validatePassword = (value: string): string | null => {
  if (value.length < 8) {
    return "密码至少 8 位";
  }

  if (!/[a-zA-Z]/u.test(value) || !/[0-9]/u.test(value)) {
    return "密码需同时包含字母和数字";
  }

  return null;
};

export const validateUsername = (value: string): string | null => {
  const trimmed = value.trim();

  if (trimmed.length < 3) {
    return "登录名至少 3 个字符";
  }

  if (!/^[a-zA-Z0-9_.]+$/u.test(trimmed)) {
    return "登录名只能包含字母、数字、下划线与点";
  }

  return null;
};

/** 空字符串按「未填写」处理，写入服务端时统一为 undefined 或 null。 */
export const optionalText = (value: string): string | undefined => {
  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
};

export const nullableText = (value: string): string | null => {
  const trimmed = value.trim();

  return trimmed.length === 0 ? null : trimmed;
};

export const toWholeNumber = (value: string, fallback: number): number => {
  const parsed = Number(value);

  return Number.isNaN(parsed) ? fallback : Math.trunc(parsed);
};

export const percentText = (value: number): string =>
  `${(value * 100).toFixed(1)}%`;

export interface TeamOption {
  id: string;
  name: string;
}

export const toTeamOptions = (
  teams: readonly { id: string; name: string }[]
): TeamOption[] => teams.map((team) => ({ id: team.id, name: team.name }));
