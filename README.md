# Warp Software Factory

An Nx workspace with standalone Angular and NestJS applications. Both use the
same Zod request, query, and response contracts.

## Requirements

- Node.js 24.22.2 or later in the 24.x line (`.nvmrc` pins 24.22.2).
- npm 11.19.1 or later in the 11.x line (`packageManager` pins 11.19.1).
- Docker with Docker Compose for PostgreSQL 17.

The official Node.js 24.22.2 distribution includes npm 11.19.1. Selecting this
runtime satisfies both requirements; no global npm upgrade is required.

Nx 24.0, Angular 21.2, NgRx Signals 21.1, TypeScript 5.9, NestJS 11, and spartan brain 1.9 are
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

Open http://localhost:4200. The responsive shell has a sidebar, top bar, and lazy
feature routes for the overview, projects, services, time entries, and reports.
On mobile, **Menu** expands the inline navigation. Feature screens are placeholders.
The overview loads `/api/health` through the development proxy to
http://localhost:3000. A schema-validated response displays **API is healthy**.
The spartan **Check API connection** button refreshes it; **Retry connection**
recovers after a failure without reloading the page. `PORT` overrides the API port; update
`apps/web/proxy.conf.json` to match if you change it.

The API exposes `GET http://localhost:3000/api/status`:

```json
{ "status": "ok", "service": "api" }
```

The overview displays database readiness from the API health response.
The existing `/api/status` contract and client remain available.

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
The next migration adds users, companies, memberships, and pending verification
requests.
Subsequent migrations must revert their tables before the schema can be reverted.

```sh
npx nx run api:migration:run
npx nx run api:migration:revert
npx nx run api:migration:generate --args="apps/api/src/database/migrations/DescribeChange"
```

Generation compares registered entities with the live database. No difference
causes TypeORM to exit with code 1 without creating a file.
Add future entities as `*.entity.ts` in `apps/api/src/database/entities`, register
them in `databaseOptions`, extend `BaseEntity`, and use `@Entity({ schema: 'app' })`.
The base provides a generated UUID and `timestamptz` creation/update columns.
TypeORM updates `updatedAt` on ORM
writes; raw SQL must update it explicitly.

Use `createZodDto` from `nestjs-zod` for future request DTOs. The global pipe
validates those DTOs. The global exception filter returns
`{statusCode,error,message,path,timestamp}` and adds `issues` for validation
failures. Unexpected server errors do not expose internal messages or stacks.
Oversized JSON returns 413. Malformed JSON returns 400 without echoing the body.

## Sign-up

`POST /api/auth/signup` accepts `email`, `password`, `firstName`, `lastName`,
and `companyName` through the shared `SignupSchema`. All fields are required;
unknown fields are rejected. Email is trimmed and lowercased. Names are trimmed
and limited to 100 characters; company names to 200; email to 254.
Passwords require 12–128 characters with no composition rules. Password whitespace
is preserved. Invalid requests return 400 with `fieldErrors` and `formErrors`.

A successful request returns 201 with safe `user`, `company`, and `membership`
objects. It never returns a password or hash and does not create a login session.
The user starts `active` with `emailVerifiedAt: null`; its membership is `active`
with `isOwner: true`. Company slugs have a UUID suffix so duplicate company names
can create separate workspaces. Duplicate normalized email returns 409.

Run migrations before using sign-up. A transaction creates the user, company,
owner membership, and an `app.email_verification_requests` row. Passwords are
stored only as salted Argon2id hashes (19 MiB memory, two iterations, one lane).
Normal user queries exclude the hash. A failed insert rolls back the whole signup.

The verification request is a durable delivery handoff, not a sent email.
`processedAt: null` marks pending requests; the worker can load the recipient
through `userId`. The email-verification module must supply the consumer, SMTP
delivery, expiring single-use tokens, and verification endpoints.
No email is sent and no verification token is generated by this endpoint yet.

## Shared contracts

The **Shared contract demo** below workspace status creates, searches, sorts,
paginates, and completes tasks. Submit an empty title to see form validation.
The form uses `CreateTaskSchema`; the API uses the same schema through
`ZodValidationPipe`. The typed HTTP client validates each response before the
page receives it. The original `/api/status` endpoint remains unchanged.

| Endpoint               | Contract                                     |
| ---------------------- | -------------------------------------------- |
| `POST /api/tasks`      | `CreateTaskSchema` → `TaskResponseSchema`    |
| `PATCH /api/tasks/:id` | `UpdateTaskSchema` → `TaskResponseSchema`    |
| `GET /api/tasks`       | `TaskQuerySchema` → `TaskListResponseSchema` |

Task titles are trimmed and must contain 1–120 characters. Creation defaults
`completed` to `false`. Updates accept either field without resetting omitted
fields; empty updates and unknown fields are invalid. Task IDs are server UUIDs.
Unknown task IDs return 404.

`TaskQuerySchema` reuses the shared `QuerySchema` and `PaginationQuerySchema`:
`page` defaults to 1, `pageSize` defaults to 10 (maximum 100), `sort` is `asc`
or `desc` (default `asc`, by title), and `search` defaults to an empty string
(maximum 120 characters, case-insensitive title match). Query strings accept
positive integers, not blank values, fractions, or repeated parameters.

Invalid bodies or queries return HTTP 400 with `ValidationErrorResponseSchema`.
Field errors use arrays so callers can show more than one error per field;
`formErrors` contains whole-object errors such as unknown fields or empty updates:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "fieldErrors": { "title": ["Enter a task title."] },
  "formErrors": []
}
```

The global exception filter adds `error`, `path`, and `timestamp` to this response.
The shared schema accepts this metadata while preserving field and form errors.

Tasks live only in API process memory. All visitors share the same demo data.
Restarting the API clears every task; multiple API processes do not share data.
There is no persistence, authentication, or per-user isolation.

### Add a contract

1. Define strict Zod objects in `libs/shared/schemas/src/lib` and export them
   from the public index. Use `CreateXSchema`, `UpdateXSchema` (partial fields),
   and `XResponseSchema`; export types with `z.infer<typeof Schema>`. Keep
   creation defaults out of partial updates and required response fields.
2. Extend `QuerySchema` for a domain's list query and define its list response.
   Shared query coercion accepts HTTP strings; `z.infer` gives the parsed
   numeric type. Parse before calling a typed client.
3. Put API code in a `scope:api`, `type:feature` library. Apply
   `new ZodValidationPipe(Schema)` to `@Body` or `@Query` and use the inferred
   parameter and response types. Validate responses with the response schema.
4. Put HTTP methods in a `scope:web`, `type:data-access` library. Accept the
   inferred request types, fetch `unknown`, and parse response schemas. In a web
   feature, use the request schema's `safeParse` before submission and display
   its errors; parse API validation errors with `ValidationErrorResponseSchema`.
5. Add schema edge cases, compiled HTTP tests, and typed client tests. Keep the
   type-compatibility assertions beside each consumer and run `npm run check`.
   A required schema field change makes outdated typed examples fail in both
   consumers; update the API and web callers together.

## Structure

```text
apps/
  web/                         Angular standalone bootstrap
  api/                         NestJS bootstrap
libs/
  shared/schemas/               Zod contracts and inferred types
  web/
    ui/                        Helm-style button using spartan BrnButton
    core/                      API configuration and functional interceptors
    feature-shell/             Responsive layout and placeholder screens
    feature-status/            Overview and health status
    data-access-status/        Validated clients and example Signal Store
    feature-tasks/             Task form and list
    data-access-tasks/         Typed task HTTP access and response validation
  api/
    feature-auth/              Sign-up validation and password hashing
    feature-status/            Status endpoint module
    feature-tasks/             In-memory task endpoint module
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

## Frontend conventions

The app explicitly uses zoneless change detection, standalone components, OnPush,
and signals. Add feature routes in `apps/web/src/app/app.routes.ts` with
`loadComponent` or `loadChildren`. Keep layout in the shell, presentation in
feature/UI libraries, and requests/state in data-access libraries. The shell
provides a skip link, active-page navigation, and route-change content focus.

### API URL

`apps/web/src/environments/environment.development.ts` configures `nx serve web`;
`environment.ts` configures production builds. Both default to `apiUrl: '/api'`.
Set the value to a complete API prefix, for example
`https://api.example.com/api` or `/backend/api`. These are public, build-time
values, never secrets. A separate origin must allow the web origin through CORS.
Production needs a host that serves the SPA for feature URLs and proxies `/api`
when using the default. Changing the API port also requires a matching dev proxy.

Clients use canonical `/api/...` paths. `provideHttpClient` registers the error
interceptor before the base-URL interceptor so errors are classified using the
canonical path. The base-URL interceptor rewrites only `/api` and `/api/` paths;
assets and third-party URLs are unchanged. HTTP failures become `ApiRequestError`
with a safe message and the original response/cause. Feature stores decide how
to render errors. Schema failures remain distinct from HTTP failures.

### Signal Store example

`HealthStore` in `libs/web/data-access-status` is the reference pattern:

- Provide the store at the feature component, so its state and subscriptions
  end with the feature. Inject stateless HTTP clients from data access.
- Use `withState` for `loading` and nullable `error`, and `withEntities` for records
  with stable IDs. The single health entity uses `id: 'api'`. Derive views from
  signals; do not copy entities into component state.
- Expose commands with `withMethods` and `rxMethod`. `load` uses `exhaustMap` to
  ignore duplicate refreshes while a request is pending. Choose `switchMap` for
  replaceable searches or `concatMap` for ordered writes instead.
- At request start, clear errors and stale entities and set loading. Validate
  unknown responses in the client before storing them. The health request times
  out after 10 seconds; it never treats an unavailable API as healthy.
- Catch errors inside the inner request so retries still work. Use `finalize`
  to clear loading on success, failure, or cancellation. `rxMethod` tears down
  with the feature injector.
- Components initiate loading and render the store signals. Show loading, a safe
  error with retry, or current entities, never a stale success after a failure.

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

The graph contains fourteen projects and these internal dependency edges:

- `web` → `web-feature-shell`, `web-feature-status`, `web-core`
- `web-feature-shell` → `web-ui`
- `web-feature-status` → `web-ui`, `web-data-access-status`
- `web-data-access-status` → `shared-schemas`, `web-core`
- `api` → `api-feature-status`, `api-core`
- `api-feature-status` → `shared-schemas`
- `web-feature-status` → `web-feature-tasks` → `web-ui`, `web-data-access-tasks`, `shared-schemas`, `web-core`
- `web-data-access-tasks` → `shared-schemas`
- `api` → `api-feature-tasks` → `api-core`, `shared-schemas`
- `api` → `api-feature-auth` → `api-core`, `shared-schemas`
- `api-core` → `shared-schemas`

The JSON export is useful in headless environments. Do not commit generated graphs.

## Checks

```bash
npm run check
```

Start PostgreSQL and configure `.env` before running these checks.
This checks Prettier, lint, strict TypeScript (including Angular templates), schema
tests, the compiled API over HTTP, module boundaries, and both production builds.
Client/store tests cover schema validation, loading, overlapping requests, errors,
retry, stale-data removal, and teardown. Interceptor tests cover URL scoping and
safe error propagation. The compiled API test exercises status and health over HTTP.
Shell DOM tests cover menu tab order and focus after route and same-route activation.
The HTTP client tests cover schema validation and backend errors. Task tests
cover create/update/query validation, structured 400 errors, list behavior, and
compile-time API/client contract compatibility.
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
32 moderate and three low package findings, including development tools.
The API does not accept user-controlled glob patterns or call OpenAPI cleanup.
No exploit path is established. No forced major-version overrides are applied
to those packages. Review `npm audit` when upgrading Nx and the lint toolchain.
