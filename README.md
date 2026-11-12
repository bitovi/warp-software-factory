# Warp Software Factory

An Nx workspace with standalone Angular and NestJS applications. Both use the
same Zod response contract.

## Requirements

- Node.js 24.22.2 or later in the 24.x line (`.nvmrc` pins 24.22.2).
- npm 11.19.1 or later in the 11.x line (`packageManager` pins 11.19.1).
- Docker with Docker Compose for PostgreSQL 17.

The official Node.js 24.22.2 distribution includes npm 11.19.1. Selecting this
runtime satisfies both requirements; no global npm upgrade is required.

Nx 24.0, Angular 21.2, TypeScript 5.9, NestJS 11, and spartan brain 1.9 are
version-pinned. Angular 21 supports Node 24.x; spartan brain 1.9 supports
Angular/CDK 21–22 and Tailwind 4. The lockfile pins transitive dependencies.

## Start

```bash
nvm install
nvm use
npm ci
cp .env.example .env
```

Set a strong, local-only `DB_PASSWORD` in `.env`. Do not commit this file.
The database name and user in the example are local identifiers, not production credentials.

```bash
docker compose up -d --wait db
npx nx run api:migration:run
npx nx serve api
```

In another terminal:

```bash
npx nx serve web
```

If your Node distribution or shell provides an older npm, run the pinned version
from the user cache instead. This needs no administrator access or global install.
Keep the prefix when running npm commands:

```bash
npx --yes npm@11.19.1 ci
npx --yes npm@11.19.1 run check
npx --yes npm@11.19.1 exec -- nx serve api
```

The official pinned Node distribution also includes Corepack. `corepack enable`
does not create npm shims by default, and `corepack install` only caches the
configured package manager. These commands do not change plain `npm`. To use
Corepack explicitly, run `corepack npm ci` or `corepack npm run check`.

Open http://localhost:4200 and select **Check API connection**. The spartan button
calls `/api/status` through the development proxy to http://localhost:3000.
A successful, schema-validated response shows `api · ok`. The page also handles
an unavailable API or an invalid response. `PORT` overrides the API port; update
`apps/web/proxy.conf.json` to match if you change it.

The API exposes `GET http://localhost:3000/api/status`:

```json
{ "status": "ok", "service": "api" }
```

These are development servers. Production hosting, a production `/api` reverse
proxy and authentication are not configured.

`GET http://localhost:3000/api/health` returns HTTP 200 with
`{"status":"ok","database":"up"}` after a database query. A failed database check
returns HTTP 503. All routes use the `/api` prefix.

The database uses the `postgres_data` volume and listens only on localhost.
`docker compose down` preserves data. Database initialization variables apply only
when the volume is empty; changing `.env` does not change an existing database's password.
For a remote database, set the connection values directly and do not start Compose.
Use `DB_SSL=true` to require TLS with certificate verification.

## Configuration

The API and migration CLI read `.env`; existing process variables take precedence.
Zod validates configuration before connecting. Invalid fields produce an
`Invalid environment configuration` error and a nonzero exit without printing
their values.

| Variable      | Meaning                                    | Default       |
| ------------- | ------------------------------------------ | ------------- |
| `NODE_ENV`    | `development`, `test`, or `production`     | `development` |
| `PORT`        | API port, integer 1–65535                  | `3000`        |
| `DB_HOST`     | Nonblank database hostname                 | Required      |
| `DB_PORT`     | Database port, integer 1–65535             | `5432`        |
| `DB_NAME`     | Nonblank database name                     | Required      |
| `DB_USER`     | Nonblank database user                     | Required      |
| `DB_PASSWORD` | Nonempty password; whitespace is preserved | Required      |
| `DB_SSL`      | Exactly `true` or `false`                  | `false`       |

## Migrations and entities

Schema synchronization and automatic startup migrations are disabled.
The first migration creates the empty `app` schema and reverts by dropping it.
It adds no domain tables. The migration history table stays in `public`.
Subsequent migrations must revert their tables before the schema can be reverted.

```sh
npx nx run api:migration:run
npx nx run api:migration:revert
npx nx run api:migration:generate --args="apps/api/src/database/migrations/DescribeChange"
```

Generation compares registered entities with the live database. No difference
causes TypeORM to exit with code 1 without creating a file.
Add future entities as `*.entity.ts` in `apps/api/src/database/entities`, extend
`BaseEntity`, and use `@Entity({ schema: 'app' })`. The base provides a generated
UUID and `timestamptz` creation/update columns. TypeORM updates `updatedAt` on ORM
writes; raw SQL must update it explicitly.

Use `createZodDto` from `nestjs-zod` for future request DTOs. The global pipe
validates those DTOs. The global exception filter returns
`{statusCode,error,message,path,timestamp}` and adds `issues` for validation
failures. Unexpected server errors do not expose internal messages or stacks.
Oversized JSON returns 413. Malformed JSON returns 400 without echoing the body.

## Structure

```text
apps/
  web/                         Angular standalone bootstrap
  api/                         NestJS bootstrap
libs/
  shared/schemas/               Zod schemas and inferred response types
  web/
    ui/                        Helm-style button using spartan BrnButton
    feature-status/            Status page
    data-access-status/        HTTP access and response validation
  api/
    feature-status/            Status endpoint module
    core/                      Global API configuration
```

`feature-*` and `data-access-*` are naming conventions for new domains, not empty
placeholder libraries. Libraries compile from source with their consuming apps.
Import their public `src/index.ts` through `@wsf/...` aliases, not internal paths.

The local `hlmBtn` directive owns the button styles and composes spartan's
`BrnButton` behavior. Tailwind 4 scans the web libraries. The global stylesheet
imports the spartan preset and defines the theme tokens. Extend this UI library
with more brain primitives and owned Helm styles as features need them. See the
[spartan installation guide](https://spartan.ng/documentation/installation).

## Module boundaries

Every project has a `scope:*` and a `type:*` tag. ESLint applies both constraints:

| Source scope | Allowed dependency scopes |
| ------------ | ------------------------- |
| `web`        | `web`, `shared`           |
| `api`        | `api`, `shared`           |
| `shared`     | `shared`                  |

| Source type   | Allowed dependency types               |
| ------------- | -------------------------------------- |
| `app`         | `feature`, `util`                      |
| `feature`     | `feature`, `ui`, `data-access`, `util` |
| `ui`          | `ui`, `util`                           |
| `data-access` | `data-access`, `util`                  |
| `util`        | `util`                                 |

`shared-schemas` and `api-core` are utilities. Web cannot import API libraries,
API cannot import web libraries, and UI cannot import data-access or features.
Nx also rejects circular dependencies and cross-project relative imports.

```bash
npm run test:boundaries
```

This runs ESLint against forbidden imports in real project paths and verifies
the `@nx/enforce-module-boundaries` errors. To check manually, temporarily add
`import { configureApi } from '@wsf/api/core';` and `void configureApi;` to
`apps/web/src/app/app.ts`, run `npx nx lint web --skip-nx-cache`, then remove them.
Lint must fail with the scope boundary rule, not just an unused-import error.

## Graph

```bash
npx nx graph
npx nx graph --file=/tmp/workspace-graph.json
```

The graph contains eight projects and these internal dependency edges:

- `web` → `web-feature-status` → `web-ui`, `web-data-access-status`
- `web-data-access-status` → `shared-schemas`
- `api` → `api-feature-status`, `api-core`
- `api-feature-status` → `shared-schemas`

The JSON export is useful in headless environments. Do not commit generated graphs.

## Checks

```bash
npm run check
```

Start PostgreSQL and configure `.env` before running these checks.
This checks Prettier, lint, strict TypeScript (including Angular templates), schema
tests, the compiled API over HTTP, module boundaries, and both production builds.
The HTTP client test covers schema validation and backend errors.
The API test builds first and uses a free port. Individual commands:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:boundaries
npm run build
```

Outputs go to `dist/apps/web/browser` and `dist/apps/api`. `npm run format` formats
source files. GitHub Actions runs `npm ci` and `npm run check` for pushes and PRs.
CI uses the npm bundled with the pinned Node release, without a global upgrade,
and starts PostgreSQL before API checks.

Integration tests require an empty, dedicated database whose name ends in `_test`.
They test migrations, inherited entity columns, and live health behavior. Never
point them at a development or production database.
The test runner loads `.env.test` over inherited variables to prevent Nx's
development `.env` values from selecting the wrong database.

```sh
docker compose exec db sh -c 'createdb -U "$POSTGRES_USER" warp_factory_test'
cp .env.test.example .env.test
# Set DB_PASSWORD in .env.test to the same local password used by Compose.
npm run test:integration
```

The tests revert their migration on completion, so the database can be reused.
Integration tests and migration targets never use the Nx cache.

## Dependency security

`npm audit --omit=dev` checks runtime dependencies. A scoped override upgrades
Nest's Multer dependency from 2.4.0 to the security-fixed 2.5.0.
The npm configuration requires a seven-day release age for dependency resolution.
Bundled npm 11.19.1 enforces this policy; the engine floor excludes older versions
that have not been validated for this workspace.
The current lockfile has no high or critical audit findings. The runtime audit
reports three moderate package findings through TypeORM's `glob`/`minimatch`
and two low findings through `nestjs-zod`/`deepmerge`. The full audit includes
35 moderate and three low package findings, including development tools.
The API does not accept user-controlled glob patterns or call OpenAPI cleanup.
No exploit path is established. No forced major-version overrides are applied
to those packages. Review `npm audit` when upgrading Nx and the lint toolchain.
