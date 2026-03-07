const path = require('path');
const dotenv = require('dotenv');
const { z } = require('zod');

const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

// Support common legacy/typo env keys used in existing deployments.
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET =
    process.env.JWT_SCREAT ||
    process.env.JWT_SECREAT ||
    process.env.jwt_secret ||
    process.env.jwt_screat ||
    process.env.jwt_secreat ||
    '';
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z
    .string()
    .default('3005')
    .transform((value) => Number(value))
    .refine((value) => Number.isInteger(value) && value > 0, 'PORT must be a positive integer'),
  DATABASE_URL: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGINS: z.string().optional(),
  DB_HOST: z.string().optional(),
  DB_PORT: z
    .string()
    .transform((value) => (value ? Number(value) : undefined))
    .optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_NAME: z.string().optional(),
  DB_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().default('1d')
});

const parsedEnv = envSchema.parse(process.env);

const config = {
  nodeEnv: parsedEnv.NODE_ENV,
  port: parsedEnv.PORT,
  databaseUrl: parsedEnv.DATABASE_URL,
  logLevel: parsedEnv.LOG_LEVEL,
  corsOrigins: parsedEnv.CORS_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? ['*'],
  // Main database for batchcode and lead-to-order (uses DB_* variables)
  postgres: {
    host: parsedEnv.DB_HOST,
    port: parsedEnv.DB_PORT ?? 5432,
    user: parsedEnv.DB_USER,
    password: parsedEnv.DB_PASSWORD,
    database: parsedEnv.DB_NAME,
    ssl: parsedEnv.DB_SSL
  },
  // Auth/Login database (uses DB_* variables, same database)
  authDatabase: {
    host: parsedEnv.DB_HOST,
    port: parsedEnv.DB_PORT ?? 5432,
    user: parsedEnv.DB_USER,
    password: parsedEnv.DB_PASSWORD,
    database: parsedEnv.DB_NAME,
    ssl: parsedEnv.DB_SSL
  },
  jwt: {
    secret: parsedEnv.JWT_SECRET,
    expiresIn: parsedEnv.JWT_EXPIRES_IN
  }
};

module.exports = config;
