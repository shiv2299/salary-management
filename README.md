# Salary Management

Employee salary management web app for an HR Manager at a multi-country organisation. Fastify API with SQLite, Next.js frontend. Conventions are in `AGENTS.md`; product, architecture and design docs are in `docs/`.

## Prerequisites

- Node.js 24 (see `.nvmrc`)
- npm 11

## Setup and run

```bash
npm ci
cp apps/api/.env.example apps/api/.env   # sets the HR login; edit the password first
npm run dev
```

The first start migrates the database and seeds 10,000 demo employees, which takes about 17 seconds before the API begins listening. Later starts skip both. The HR user is created from `HR_SEED_EMAIL` / `HR_SEED_PASSWORD` on that first start only; changing them afterwards does not change an existing password. `npm run db:seed -w @acme/api` runs the same steps without starting the server.

**Starting over.** `npm run db:reset -w @acme/api` drops every table, applies the migrations and seeds a fresh dataset, keeping the HR login (its email, password and any open session). Stop the API first. Run it after pulling a change to the schema or the seed: nothing wipes the database automatically, and the start-up seed does nothing once employees exist. With Docker, remove the volume instead (`docker volume rm salary-data`) and start the container again.

- Web: http://localhost:3000 (proxies `/api/*` to the API)
- API: http://localhost:3001, health at `/api/health`

## Commands

Run from the repo root.

| Command                            | Purpose                                                         |
| ---------------------------------- | --------------------------------------------------------------- |
| `npm run dev`                      | API and web together                                            |
| `npm run build`                    | Build every workspace                                           |
| `npm run lint`                     | ESLint (type-aware)                                             |
| `npm run typecheck`                | TypeScript, all workspaces                                      |
| `npm test`                         | Vitest, all workspaces                                          |
| `npm run format` / `format:check`  | Prettier                                                        |
| `npm run db:generate -w @acme/api` | Generate Drizzle migrations                                     |
| `npm run db:migrate -w @acme/api`  | Apply Drizzle migrations                                        |
| `npm run db:seed -w @acme/api`     | Migrate and seed an empty database, without starting the server |
| `npm run db:reset -w @acme/api`    | Drop all data, migrate and seed again, keeping the HR login     |

## Production build

```bash
API_URL=http://localhost:3001 npm run build
node apps/api/dist/server.js
node apps/web/.next/standalone/apps/web/server.js
```

`API_URL` is read at build time because Next.js resolves rewrite destinations during `next build`.

A relative `DATABASE_PATH` is resolved against `apps/api`, so the default database is always `apps/api/data/app.db` whichever directory the API is started from.

## Docker

One image runs both the API and the Next.js server (`scripts/start.sh` starts the two and stops the container if either dies). The web server listens on port 3000 and proxies `/api/*` to the API on `127.0.0.1:3001` inside the container.

```bash
cp .env.example .env     # set JWT_SECRET and the HR login
docker compose up --build
```

Or without compose:

```bash
docker build -t salary-management .
docker run -p 3000:3000 -v salary-data:/data --env-file .env salary-management
```

| Variable                            | Required   | Purpose                                                                                                                                                    |
| ----------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`                        | yes        | Signs the session cookie. At least 32 characters; the API refuses to start in production without it. Generate with `openssl rand -base64 48`.              |
| `HR_SEED_EMAIL`, `HR_SEED_PASSWORD` | first boot | Create the single HR login (password 8+ characters). Set both or neither. Ignored once a user exists, so changing them later does not change the password. |
| `DATABASE_PATH`                     | no         | SQLite file location. The image sets `/data/app.db`; mount a persistent volume at `/data`.                                                                 |
| `PORT`                              | no         | The API's internal port (default 3001). The public port is the web server's 3000.                                                                          |
| `API_URL`                           | build only | Where the web server forwards `/api/*`. Baked in at build time (`--build-arg API_URL=...`); the default `http://127.0.0.1:3001` is right for this image.   |
| `LOG_LEVEL`                         | no         | `info` by default.                                                                                                                                         |

- **Seed on boot**: on the first start with an empty database the API migrates and seeds 10,000 demo employees (about 17 seconds before it listens; the health check allows for it). Every later start is an idempotent no-op when employees already exist, so a restart never re-seeds.
- **Persistence**: the SQLite file must be on a persistent volume. On a host with an ephemeral filesystem the data would be lost on every deploy, and seed-on-boot would silently replace it with fresh demo data.
- **HTTPS**: in production the session cookie is `Secure`, so browsers only send it over HTTPS (plain `http://localhost` is exempt). Put the container behind a TLS-terminating proxy or platform router.
- **Health**: `GET /api/health` is public and returns `{"status":"ok","database":"ok"}`; the image `HEALTHCHECK` calls it through the web server.
- The container runs as the unprivileged `node` user. Never commit `.env`; it is git-ignored.

## Scope

Salary means annual base pay. The app keeps every salary change as effective-dated history and shows cross-country insights in USD through a static FX table. It is built for a single HR Manager login.

Deliberately left out: bonus, allowances and equity; live FX rates; role-based or country/department-restricted access; Excel import (CSV export is supported). The full list, with reasons, is in `docs/requirements.md` §4. Trade-offs, including how restricted access would be added, are in `docs/decisions.md`.

## Structure

```
packages/shared/   Zod schemas shared by API and web (@acme/shared)
apps/api/          Fastify API, Drizzle + better-sqlite3 (@acme/api)
apps/web/          Next.js App Router, Tailwind, shadcn/ui (@acme/web)
docs/              Requirements, spec, architecture, design, decisions, performance
```
