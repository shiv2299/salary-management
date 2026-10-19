import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// apps/api, for both src/config.ts in dev and the bundled dist/server.js, so a relative
// DATABASE_PATH points at the same file regardless of the working directory.
const API_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const MIGRATIONS_FOLDER = resolve(API_ROOT, 'drizzle');

const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    HOST: z.string().min(1).default('0.0.0.0'),
    DATABASE_PATH: z
      .string()
      .min(1)
      .default('./data/app.db')
      .transform((path) => (path === ':memory:' ? path : resolve(API_ROOT, path))),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    JWT_SECRET: z.string().min(32).optional(),
    HR_SEED_EMAIL: z.string().min(1).optional(),
    HR_SEED_PASSWORD: z.string().min(8).optional(),
  })
  .superRefine((env, ctx) => {
    // The HR login is created from this pair, so one without the other can never work.
    if (env.HR_SEED_EMAIL && !env.HR_SEED_PASSWORD) {
      ctx.addIssue({
        code: 'custom',
        path: ['HR_SEED_PASSWORD'],
        message: 'required with HR_SEED_EMAIL',
      });
    }
    if (env.HR_SEED_PASSWORD && !env.HR_SEED_EMAIL) {
      ctx.addIssue({
        code: 'custom',
        path: ['HR_SEED_EMAIL'],
        message: 'required with HR_SEED_PASSWORD',
      });
    }
  });

// Used outside production only, so a fresh clone runs without setup. Production must set its own.
const DEV_JWT_SECRET = 'development-only-secret-do-not-use-in-production';

export type Config = Omit<z.infer<typeof configSchema>, 'JWT_SECRET'> & { JWT_SECRET: string };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  const { JWT_SECRET, ...rest } = result.data;
  if (rest.NODE_ENV === 'production' && !JWT_SECRET) {
    throw new Error(
      'Invalid environment configuration:\n  JWT_SECRET: required in production (at least 32 characters)',
    );
  }
  return { ...rest, JWT_SECRET: JWT_SECRET ?? DEV_JWT_SECRET };
}
