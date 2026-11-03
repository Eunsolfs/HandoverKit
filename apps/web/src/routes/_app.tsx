import { createFileRoute, redirect } from "@tanstack/react-router";

import { AppShell } from "#src/components/app/app-shell.tsx";

export const Route = createFileRoute("/_app")({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({ search: { redirect: location.href }, to: "/login" });
    }

    return { session: context.session };
  },
  component: AppShell,
});
