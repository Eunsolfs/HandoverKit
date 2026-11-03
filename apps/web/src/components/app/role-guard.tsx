import { ShieldAlertIcon } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "#src/components/app/empty-state.tsx";
import { ErrorState } from "#src/components/app/error-state.tsx";
import { PageSkeleton } from "#src/components/app/loading.tsx";
import { useMe } from "#src/lib/me.ts";
import { toAppRole } from "#src/lib/roles.ts";
import type { AppRole } from "#src/lib/roles.ts";

interface NoPermissionPanelProps {
  title?: string;
  description?: string;
}

const NoPermissionPanel = ({
  description = "当前账号没有访问该页面的权限。如需开通，请联系团队管理员。",
  title = "无权访问",
}: NoPermissionPanelProps) => (
  <div className="mx-auto w-full max-w-lg py-10">
    <EmptyState
      description={description}
      icon={ShieldAlertIcon}
      title={title}
    />
  </div>
);

interface RoleGuardProps {
  allow: AppRole[];
  children: ReactNode;
}

/** 页面级角色守卫；服务端 procedure 才是安全边界，这里只做界面收敛。 */
export const RoleGuard = ({ allow, children }: RoleGuardProps) => {
  const me = useMe();

  if (me.isPending) {
    return <PageSkeleton />;
  }

  if (me.isError) {
    return (
      <ErrorState
        error={me.error}
        onRetry={() => {
          void me.refetch();
        }}
      />
    );
  }

  const role = toAppRole(me.data.user.role);

  if (!allow.includes(role)) {
    return <NoPermissionPanel />;
  }

  return <div className="contents">{children}</div>;
};
