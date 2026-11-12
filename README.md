# Warp Software Factory

An Nx workspace with standalone Angular and NestJS applications. Both use the
same Zod response contract.

## Requirements

- Node.js 24.22.2 or later in the 24.x line (`.nvmrc` pins 24.22.2).
- npm 11.19.1 or later in the 11.x line (`packageManager` pins 11.19.1).

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

The additive `GET /api/health` endpoint returns `{ "status": "ok" }`. It reports
process liveness only, not database readiness. The frontend also accepts
`{ "status": "ok", "database": "up" }` when the backend provides a readiness check.
The existing `/api/status` contract and client remain available.

These are development servers. Production hosting, a production `/api` reverse
proxy, authentication, and persistence are not configured.

## Structure

```text
apps/
  web/                         Angular standalone bootstrap
  api/                         NestJS bootstrap
libs/
  shared/schemas/               Zod schemas and inferred response types
  web/
    ui/                        Helm-style button using spartan BrnButton
    core/                      API configuration and functional interceptors
    feature-shell/             Responsive layout and placeholder screens
    feature-status/            Overview and health status
    data-access-status/        Validated clients and example Signal Store
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

The graph contains ten projects and these internal dependency edges:

- `web` → `web-feature-shell`, `web-feature-status`, `web-core`
- `web-feature-shell` → `web-ui`
- `web-feature-status` → `web-ui`, `web-data-access-status`
- `web-data-access-status` → `shared-schemas`, `web-core`
- `api` → `api-feature-status`, `api-core`
- `api-feature-status` → `shared-schemas`

The JSON export is useful in headless environments. Do not commit generated graphs.

## Checks

```bash
npm run check
```

This checks Prettier, lint, strict TypeScript (including Angular templates), schema
tests, the compiled API over HTTP, module boundaries, and both production builds.
Client/store tests cover schema validation, loading, overlapping requests, errors,
retry, stale-data removal, and teardown. Interceptor tests cover URL scoping and
safe error propagation. The compiled API test exercises status and health over HTTP.
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
