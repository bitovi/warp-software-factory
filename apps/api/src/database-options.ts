import { join } from 'node:path';
import { DataSourceOptions } from 'typeorm';
import { Environment } from './config/environment';

export function databaseOptions(
  env: Environment,
): Extract<DataSourceOptions, { type: 'postgres' }> {
  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl: env.DB_SSL ? { rejectUnauthorized: true } : false,
    synchronize: false,
    migrationsRun: false,
    migrationsTransactionMode: 'all',
    entities: [join(__dirname, 'database', 'entities', '*.entity.{ts,js}')],
    migrations: [join(__dirname, 'database', 'migrations', '*.{ts,js}')],
    connectTimeoutMS: 5000,
    extra: { statement_timeout: 5000 },
  };
}
