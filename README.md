# Salary Management

Employee salary management web app for an HR Manager at a multi-country organisation. Fastify API with SQLite, Next.js frontend. Conventions are in `AGENTS.md`; product, architecture and design docs are in `docs/`.

## Prerequisites

- Node.js 24 (see `.nvmrc`)
- npm 11

## Setup and run

```bash
npm ci
cp apps/api/.env.example apps/api/.env   # optional, defaults are the same
npm run dev
```

- Web: http://localhost:3000 (proxies `/api/*` to the API)
- API: http://localhost:3001, health at `/api/health`

## Commands

Run from the repo root.

| Command                            | Purpose                     |
| ---------------------------------- | --------------------------- |
| `npm run dev`                      | API and web together        |
| `npm run build`                    | Build every workspace       |
| `npm run lint`                     | ESLint (type-aware)         |
| `npm run typecheck`                | TypeScript, all workspaces  |
| `npm test`                         | Vitest, all workspaces      |
| `npm run format` / `format:check`  | Prettier                    |
| `npm run db:generate -w @acme/api` | Generate Drizzle migrations |
| `npm run db:migrate -w @acme/api`  | Apply Drizzle migrations    |

## Production build

```bash
API_URL=http://localhost:3001 npm run build
node apps/api/dist/server.js
node apps/web/.next/standalone/apps/web/server.js
```

`API_URL` is read at build time because Next.js resolves rewrite destinations during `next build`.

A relative `DATABASE_PATH` is resolved against `apps/api`, so the default database is always `apps/api/data/app.db` whichever directory the API is started from.

## Structure

```
packages/shared/   Zod schemas shared by API and web (@acme/shared)
apps/api/          Fastify API, Drizzle + better-sqlite3 (@acme/api)
apps/web/          Next.js App Router, Tailwind, shadcn/ui (@acme/web)
docs/              Requirements, architecture, design, decisions
```
