export type AppRole = "super_admin" | "team_admin" | "member";

/** 服务端返回的 role 是字符串；在这里收窄为可穷举的前端角色。 */
export const toAppRole = (value: string | null | undefined): AppRole => {
  if (value === "super_admin" || value === "team_admin") {
    return value;
  }

  return "member";
};

export const isAdminRole = (role: AppRole): boolean => role !== "member";

export const ROLE_LABELS: Record<AppRole, string> = {
  member: "普通用户",
  super_admin: "超级管理员",
  team_admin: "团队管理员",
};
