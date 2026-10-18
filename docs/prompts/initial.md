# ROLE
You are a senior TypeScript engineer creating the starting point for a project. Do scaffolding only.

# PROJECT CONTEXT
An employee salary management web app for an HR Manager at a 10,000-employee, multi-country organisation. Stack: Node.js + TypeScript API (Fastify), Next.js frontend, SQLite. This task covers ONLY: the monorepo, API skeleton, web skeleton, tooling and CI. The domain features come in later tasks.

# WORKING RULES
1. First print a short plan (steps and the packages you intend to install).
2. Verify every package version with `npm view <package> version` and read the installed package's docs for its current setup. Stable releases only, no canary or pre-release.
3. Scaffold only. Do NOT add: employees, salaries, auth, database tables, seed data, or any domain logic. No lorem ipsum, no unused dependencies, no commented-out code. Delete all create-next-app boilerplate (default page content, logos, demo styles).
4. This repository already exists on branch `main` with prior commits (`docs/` and `AGENTS.md` at the repo root). Do NOT run `git init`, and do NOT recreate, move, or duplicate the content of `AGENTS.md` or anything under `docs/` — read `AGENTS.md` first and follow it. Continue committing on top of the existing history. Make small commits as you go, using Conventional Commits (chore/feat/test/ci/docs). Every commit must pass lint, typecheck and tests as of that commit. Never force-push or rewrite history.
5. Run every command and report real output. If something fails, fix the root cause. Never skip tests, disable lint rules, or use `any` / `@ts-ignore` to get past errors.
6. If a requirement is ambiguous, choose the simpler option and record it in the final report. Only ask me a question if you are truly blocked.

# TARGET STRUCTURE
  /
  AGENTS.md (already exists — do not recreate)
  README.md, package.json (npm workspaces)
  tsconfig.base.json, eslint.config.js (root), .prettierrc, .editorconfig, .gitignore, .nvmrc
  .github/workflows/ci.yml
  packages/shared/   (name @acme/shared)
  apps/api/          (name @acme/api)
  apps/web/          (name @acme/web)

# ROOT TOOLING
- npm workspaces. Root scripts: dev (runs api and web together using `concurrently`), build, lint, typecheck, test, format, format:check.
- TypeScript strict mode plus noUncheckedIndexedAccess, shared via tsconfig.base.json. For apps/web, keep the compiler options Next.js requires and extend the base config only where Next allows.
- ONE lint strategy for the repo: ESLint flat config with typescript-eslint (type-aware recommended rules), eslint-plugin-react-hooks and eslint-config-next for apps/web, eslint-config-prettier, and Prettier. Remove any conflicting config that create-next-app generates. Call ESLint directly if `next lint` is unavailable in the installed Next version.
- .nvmrc and `engines` set to the current Node LTS (check `node -v` and the Node release schedule).
- .gitignore covers node_modules, dist, .next, coverage, .env, and data/*.db.

# packages/shared
- Consumed directly as TypeScript source (package.json `exports` pointing at src/index.ts).
- Contains ONLY a Zod schema `healthResponseSchema` and its inferred type `HealthResponse`: { status: "ok", database: "ok" | "error" }. This proves monorepo wiring end to end.

# apps/api
- Fastify (latest stable), Zod, and fastify-type-provider-zod. Follow that package's README for compatibility with the installed Zod and Fastify versions.
- `src/config.ts`: parse env with Zod (NODE_ENV, PORT default 3001, HOST default 0.0.0.0, DATABASE_PATH default ./data/app.db, LOG_LEVEL). Fail fast with a clear error on invalid values. Provide `.env.example`. Load .env in dev with Node's built-in flag if available instead of adding dotenv.
- `src/app.ts`: exports `buildApp(deps)` that returns a Fastify instance WITHOUT listening, so tests can use `app.inject()`. Register the Zod validator and serializer compilers and a central error handler returning `{ error: { code, message } }`. Unknown `/api/*` routes return a JSON 404 in that same shape. No CORS plugin: the browser reaches the API through the Next.js proxy on the same origin.
- `src/server.ts`: loads config, builds the app, listens, and shuts down gracefully on SIGINT/SIGTERM (close server, close database).
- `src/routes/health.ts`: `GET /api/health` validated against `healthResponseSchema` from @acme/shared, running `select 1` against the database. No timestamps or uptime in the body, so it stays deterministic.
- `src/db/client.ts`: `createDatabase(path)` using better-sqlite3 and drizzle-orm. Set `foreign_keys = ON`, and WAL mode for file databases (not `:memory:`). Return the db handle and a `close()` function. Configure drizzle-kit (config file and npm scripts db:generate and db:migrate) but do NOT create tables and do NOT add a fake table to test it.
- Build with tsup, bundling the workspace package so `node apps/api/dist/server.js` runs standalone. Dev with tsx watch.
- Tests (Vitest, in-memory SQLite, no network, no real clock): health returns 200 and a body that parses with the shared schema; unknown /api route returns the JSON 404 shape; invalid config throws a readable error. Test names are plain sentences.

# apps/web
- Next.js (latest stable), App Router, TypeScript, Tailwind CSS, ESLint, `src/` directory, import alias `@/*`. Create it with `npx create-next-app@latest` inside apps/web: run `--help` first and pass flags non-interactively (use npm, skip git init). Then reconcile with the root tooling as described above and delete boilerplate.
- shadcn/ui initialised per the CURRENT official Next.js install guide. Add only the components you actually use (Card, Badge). Set the Tailwind theme's color tokens, base typography (Inter), and border-radius scale to match `docs/design.md` §2 exactly (background/surface/border/text/accent/semantic colors, 4px radius on inputs/buttons/badges) — do this now, in the shadcn theme config, rather than leaving the library defaults for a later session to redo.
- `next.config.ts`:
  - `transpilePackages: ['@acme/shared']`.
  - `output: 'standalone'`, with `outputFileTracingRoot` set to the monorepo root so workspace dependencies are traced. Verify against the docs.
  - `async rewrites()` mapping `/api/:path*` to `${process.env.API_URL ?? 'http://localhost:3001'}/api/:path*`. Add a one-line comment that rewrite destinations are resolved at build time (verify this in the docs).
  - Do NOT use static export.
- Dev server on port 3000, API on 3001.
- Data fetching: TanStack Query in a client `Providers` component mounted in the root layout. All API calls go to the relative path `/api/...` from the browser, through the rewrite. No server-side calls to the API.
- Structure: `src/app/` (layout.tsx, page.tsx, providers.tsx, globals.css), `src/features/health/` (query hook and status component), `src/components/ui/` (shadcn), `src/lib/api.ts` (small typed fetch wrapper that throws a typed error on non-2xx using the `{ error }` shape), `src/lib/utils.ts`.
- UI: a root layout with a header showing "Salary Management", and ONE route `/` with a card showing the API health status (loading, ok and error states). The layout stays a Server Component; the health status is a Client Component. No other pages or nav items.
- Tests (Vitest + React Testing Library + jsdom, with @vitejs/plugin-react and the `@/` alias): render the health status with a stubbed `fetch` for the ok and error states; QueryClient with retry disabled. Do not unit test async Server Components.

# CI
`.github/workflows/ci.yml` on push and pull_request: checkout, setup-node (version from .nvmrc, npm cache), `npm ci`, lint, typecheck, test, build. Use the current major versions of the actions (verify).

# DOCS
- AGENTS.md already exists at the repo root — read it before doing anything else and follow it; do not edit or duplicate its content.
- README.md: short. What it is, prerequisites, setup and run commands, repo structure. No marketing text.

# SUGGESTED COMMIT SEQUENCE
1. chore: initialise npm workspace, TypeScript base config, lint and format tooling
2. feat(shared): add shared package with health response schema
3. feat(api): scaffold Fastify app with config, health route and error handling (with tests)
4. feat(api): add SQLite client factory and Drizzle configuration
5. feat(web): scaffold Next.js app with Tailwind and shadcn/ui
6. feat(web): add typed API client and health status page (with tests)
7. chore: add dev orchestration and standalone production build wiring
8. ci: add GitHub Actions workflow
9. docs: add README

# ACCEPTANCE CRITERIA
- On a fresh clone, `npm ci && npm run dev` starts both apps, and http://localhost:3000 shows API health "ok" through the proxy.
- `npm run lint`, `typecheck`, `test` and `build` all pass at the repo root.
- Production check: start the built API (`node apps/api/dist/server.js`) and the Next.js standalone server separately, and confirm the UI at port 3000 still shows health "ok". Report the exact path of the standalone server entry file.
- No template leftovers, no unused dependencies, no `any`.
- `git log` shows the small commits above.

# FINAL REPORT
When done, report: installed versions of major packages; commands you ran and their real results; any deviation from this spec and why; anything you could not verify; anything I should review by hand.