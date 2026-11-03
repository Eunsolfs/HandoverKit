import { useQuery } from "@tanstack/react-query";

import { api } from "#src/lib/api.ts";

/**
 * 当前登录用户的实时资料（角色/团队/可访问事项）。
 * 传入 activeTeamId 时按团队取数，超级管理员切换团队后 team/matters 同步变化；
 * 不传时服务端按「自己的团队，否则第一个团队」兜底，供外壳首次加载使用。
 */
export const useMe = (teamId?: string | null) =>
  useQuery({
    ...api.me.get.queryOptions({
      input: teamId === undefined || teamId === null ? undefined : { teamId },
    }),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
