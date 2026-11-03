# handoverkit

React · Hono · oRPC · SQLite · Drizzle · Better Auth · Node · Docker, on [Vite+](https://viteplus.dev).

| Layer     | Choice                                                                             |
| --------- | ---------------------------------------------------------------------------------- |
| Frontend  | React 19, TanStack Router, TanStack Query, Tailwind CSS 4                          |
| Backend   | Hono on Node.js 24                                                                 |
| API       | oRPC (end-to-end types, no codegen) plus OpenAPI at `/api`                         |
| Database  | SQLite through Node's built-in `node:sqlite`, Drizzle ORM v1                       |
| Auth      | Better Auth, email and password, sessions in SQLite                                |
| UI        | shadcn/ui on Base UI, in `packages/ui`                                             |
| Deploy    | Docker: one self-contained image, no `node_modules` at runtime, SQLite on a volume |
| Toolchain | Vite+ (`vp`): dev, build, test, lint, format, type check                           |

## Getting started

```sh
vp install
vp run db:migrate   # creates apps/server/local.db
vp run dev
```

Open http://localhost:5173 and create an account. API docs are at http://localhost:5173/api.

The browser always talks to one origin: in development Vite proxies `/rpc` and `/api` to the server, in production the server serves the SPA. Session cookies therefore stay first-party and no CORS is configured. `BETTER_AUTH_URL` is that browser-facing origin (`http://localhost:5173` in development), not the server's own port.

## Environment

Each app loads the `.env` in its directory. Project creation wrote them with the values below and generated a unique `BETTER_AUTH_SECRET`. Git ignores these files. For a fresh clone, recreate them from these examples and fill in the empty `BETTER_AUTH_SECRET` with the output of `openssl rand -base64 32`; the server rejects an unset secret.

`apps/server/.env`

```dotenv
DATABASE_URL=local.db
BETTER_AUTH_URL=http://localhost:5173
BETTER_AUTH_SECRET=
PORT=3000
```

## Commands

```sh
vp check          # format, lint, type check
vp run knip       # unused files, exports, dependencies, and catalog entries
vp test           # unit and integration tests (Vitest)
vp run test:e2e   # end-to-end tests (Playwright) in Chromium, against a real server and database
vp run ready      # check + knip + test + test:e2e + production build
```

The first `vp run test:e2e` needs a browser: `cd apps/web && vp exec playwright install chromium`.

## Database

Edit a table in `packages/db/src/schema/`, then:

```sh
vp run db:generate   # writes a migration to packages/db/src/migrations/
vp run db:migrate    # applies it
```

## Production

```sh
BETTER_AUTH_SECRET=$(openssl rand -base64 32) docker compose up --build
```

This runs migrations once, then serves the API and the web app on http://localhost:3000. The database lives at `/data/app.db` on the `data` volume.

The image runs two entry points from the same build:

- `node dist/migrate.mjs` applies pending migrations and exits;
- `node dist/index.mjs` serves `/rpc`, `/api`, `/api/auth`, and the SPA.

Both read `DATABASE_URL`, `BETTER_AUTH_URL` (the public origin), and `BETTER_AUTH_SECRET`; the server also reads `PORT` (default `3000`).

SQLite allows one writer at a time, so run a single app replica. Back up the volume, or move to the PostgreSQL template when you need several.
