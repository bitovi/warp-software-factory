# Warp Software Factory

An Nx workspace with standalone Angular and NestJS applications. Both use the
same Zod request, query, and response contracts.

## Requirements

- Node.js 24.22.2 or later in the 24.x line (`.nvmrc` pins 24.22.2).
- npm 11.19.1 or later in the 11.x line (`packageManager` pins 11.19.1).

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
proxy, authentication, and persistence are not configured.

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
    feature-status/            Status page
    data-access-status/        HTTP access and response validation
    feature-tasks/             Task form and list
    data-access-tasks/         Typed task HTTP access and response validation
  api/
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

The graph contains eleven projects and these internal dependency edges:

- `web` → `web-feature-status` → `web-ui`, `web-data-access-status`
- `web-data-access-status` → `shared-schemas`
- `api` → `api-feature-status`, `api-core`
- `api-feature-status` → `shared-schemas`
- `web` → `web-feature-tasks` → `web-ui`, `web-data-access-tasks`, `shared-schemas`
- `web-data-access-tasks` → `shared-schemas`
- `api` → `api-feature-tasks` → `api-core`, `shared-schemas`
- `api-core` → `shared-schemas`

The JSON export is useful in headless environments. Do not commit generated graphs.

## Checks

```bash
npm run check
```

This checks Prettier, lint, strict TypeScript (including Angular templates), schema
tests, the compiled API over HTTP, module boundaries, and both production builds.
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
CI uses the npm bundled with the pinned Node release, without a global upgrade.

## Dependency security

`npm audit --omit=dev` checks runtime dependencies. A scoped override upgrades
Nest's Multer dependency from 2.4.0 to the security-fixed 2.5.0.
The npm configuration requires a seven-day release age for dependency resolution.
Bundled npm 11.19.1 enforces this policy; the engine floor excludes older versions
that have not been validated for this workspace.
The full audit still reports transitive development-tool advisories in
`glob`, `minimatch`, and `deepmerge`. No forced major-version overrides are applied
to those tools. Review `npm audit` when upgrading Nx and the lint toolchain.
