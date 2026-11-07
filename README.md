# Warp Software Factory

Minimal Nx workspace with a NestJS API, TypeORM migrations, and PostgreSQL 17.

## Requirements

- Node.js 22.16+ or 24 LTS and npm.
- Docker with Docker Compose.

## Start the API

```sh
npm ci
cp .env.example .env
```

Set a strong, local-only `DB_PASSWORD` in `.env`. Do not commit this file.
The database name and user in the example are local identifiers, not production credentials.

```sh
docker compose up -d --wait db
npx nx run api:migration:run
npx nx serve api
```

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

## Checks

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run format:check
```

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

To run the compiled API after building:

```sh
node dist/apps/api/main.js
```
