import type { RouterClient } from "@orpc/server";

import { exceptionsRouter } from "#src/routers/exceptions.ts";
import { health } from "#src/routers/health.ts";
import { itemsRouter } from "#src/routers/items.ts";
import { mattersRouter } from "#src/routers/matters.ts";
import { meRouter } from "#src/routers/me.ts";
import { recordsRouter } from "#src/routers/records.ts";
import { statsRouter } from "#src/routers/stats.ts";
import { subWarehousesRouter } from "#src/routers/sub-warehouses.ts";
import { teamsRouter } from "#src/routers/teams.ts";
import { usageRouter } from "#src/routers/usage.ts";
import { usersRouter } from "#src/routers/users.ts";

export type { Context, Profile } from "#src/context.ts";

export const appRouter = {
  exceptions: exceptionsRouter,
  health,
  items: itemsRouter,
  matters: mattersRouter,
  me: meRouter,
  records: recordsRouter,
  stats: statsRouter,
  subWarehouses: subWarehousesRouter,
  teams: teamsRouter,
  usage: usageRouter,
  users: usersRouter,
};

export type AppRouter = typeof appRouter;

export type AppRouterClient = RouterClient<AppRouter>;
