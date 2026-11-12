import { join } from 'node:path';
import { DataSourceOptions } from 'typeorm';
import { Environment } from './config/environment';
import { Company } from './database/entities/company.entity';
import { EmailVerificationRequest } from './database/entities/email-verification-request.entity';
import { Membership } from './database/entities/membership.entity';
import { User } from './database/entities/user.entity';
import { AuthSession } from './database/entities/auth-session.entity';
import { RefreshToken } from './database/entities/refresh-token.entity';

export function databaseOptions(
  env: Pick<
    Environment,
    'DB_HOST' | 'DB_PORT' | 'DB_USER' | 'DB_PASSWORD' | 'DB_NAME' | 'DB_SSL'
  >,
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
    entities: [
      User,
      Company,
      Membership,
      EmailVerificationRequest,
      AuthSession,
      RefreshToken,
    ],
    migrations: [join(__dirname, 'database', 'migrations', '*.{ts,js}')],
    connectTimeoutMS: 5000,
    extra: { statement_timeout: 5000 },
  };
}
