import type { RouterClient } from "@orpc/server";

import { health } from "#src/routers/health.ts";
import { meRouter } from "#src/routers/me.ts";

export type { Context, Profile } from "#src/context.ts";

export const appRouter = {
  health,
  me: meRouter,
};

export type AppRouter = typeof appRouter;

export type AppRouterClient = RouterClient<AppRouter>;
