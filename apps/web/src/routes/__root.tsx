import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  HeadContent,
  Link,
  Outlet,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ThemeProvider } from "next-themes";

import { Button } from "@handoverkit/ui/components/button";
import { Toaster } from "@handoverkit/ui/components/sonner";

import { EmptyState } from "#src/components/app/empty-state.tsx";
import { ErrorState } from "#src/components/app/error-state.tsx";
import { getSession } from "#src/lib/auth.ts";

interface RouterContext {
  queryClient: QueryClient;
}

const RootLayout = () => (
  <ThemeProvider
    attribute="class"
    defaultTheme="system"
    disableTransitionOnChange
    scriptProps={{ type: "application/json" }}
  >
    <HeadContent />
    <Outlet />
    <Toaster position="top-center" richColors />
    {import.meta.env.DEV ? (
      <>
        <TanStackRouterDevtools position="bottom-left" />
        <ReactQueryDevtools buttonPosition="bottom-right" />
      </>
    ) : null}
  </ThemeProvider>
);

const NotFoundPage = () => (
  <div className="mx-auto flex min-h-svh w-full max-w-md items-center px-4">
    <div className="w-full">
      <EmptyState
        action={
          <Button
            nativeButton={false}
            render={<Link to="/" />}
            size="sm"
            variant="outline"
          >
            返回工作台
          </Button>
        }
        description="链接可能已失效，请从工作台重新进入。"
        title="页面不存在"
      />
    </div>
  </div>
);

const RootErrorPage = ({ error }: { error: Error }) => {
  const router = useRouter();

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-lg items-center px-4">
      <div className="w-full">
        <ErrorState
          error={error}
          onRetry={() => {
            void router.invalidate();
          }}
          title="页面加载失败"
        />
      </div>
    </div>
  );
};

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => ({ session: await getSession() }),
  component: RootLayout,
  errorComponent: ({ error }) => (
    <RootErrorPage
      error={error instanceof Error ? error : new Error("页面加载失败，请重试")}
    />
  ),
  head: () => ({
    meta: [
      { title: "易交接 · 医疗用物与交接记录" },
      {
        content:
          "面向医疗科室的用物与交接记录系统：扫码接班核对、用物消耗登记、交班表与库存追溯。",
        name: "description",
      },
    ],
  }),
  notFoundComponent: NotFoundPage,
});
