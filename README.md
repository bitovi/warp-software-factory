# Warp Software Factory

An Nx workspace with standalone Angular and NestJS applications. Both use the
same Zod response contract.

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

Open http://localhost:4200 for the reports demo. Select **Workspace status**, then
**Check API connection**. The spartan button
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

## Reports demo

`/reports` shows a deterministic sample workspace with 56 entries from October 26
through November 8, 2026. Date presets use November 8 as the demo's reference day,
not the system clock. The reports page needs no running API.

- Date range, project/client/person multi-selects, billable status, approval status,
  grouping, chart breakdown, and Summary/Detailed view are stored in query parameters.
  Copy the URL to share a selection. Reload and browser Back/Forward restore it.
- Cards, charts, subtotals, and exports derive from the same signal-based
  `ReportsStore`. Dates are inclusive UTC calendar dates. Charts show tracked days.
- CSV, XLSX, and paginated PDF downloads snapshot the selected filters, view,
  grouping, summary metrics, and all filtered entries. Collapsing a group does not
  exclude it from export. All amounts use USD. CSV text is formula-escaped; XLSX
  uses explicit string cells. XLSX/PDF code loads only when exporting.
- **Demo access** switches frontend permission examples. Without `reports:view`,
  the page and navigation item disappear. Without `reports:financial`, amounts
  disappear from cards, entries, subtotals, and every export format.

This is not production authorization. The demo permission switch is not a login,
and fixture amounts ship in the browser bundle. There is no report API, database,
or server-side security. Replace the `REPORTS_SOURCE` injection-token provider
with authenticated, server-authorized data and permission signals before using
real data. The server must enforce both permissions and exclude forbidden
financial fields from responses. PDF uses the standard Helvetica font, suitable
for this Latin-script fixture; other scripts require an embedded Unicode font.

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
    feature-reports/           Reports workspace, charts, URL/history integration
    data-access-reports/       Signal store, fixture source, filters and exporters
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

The graph contains ten projects and these internal dependency edges:

- `web` → `web-feature-status` → `web-ui`, `web-data-access-status`
- `web` → `web-feature-reports` → `web-feature-status`, `web-data-access-reports`
- `web-data-access-status` → `shared-schemas`
- `api` → `api-feature-status`, `api-core`
- `api-feature-status` → `shared-schemas`

The JSON export is useful in headless environments. Do not commit generated graphs.

## Checks

```bash
npm run check
```

This checks Prettier, lint, strict TypeScript (including Angular templates), schema
tests, the compiled API over HTTP, module boundaries, and both production builds.
The HTTP client test covers schema validation and backend errors.
Reports tests cover filter intersections, URL round trips, permission revocation,
reactive totals/charts, immutable export snapshots, formula safety, and real
CSV/XLSX/PDF output.
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
