import { createDb } from "@handoverkit/db";
import { migrateDatabase } from "@handoverkit/db/migrate";

import { env } from "#src/env.ts";

const db = createDb(env.DATABASE_URL);

migrateDatabase(db);

db.$client.close();
