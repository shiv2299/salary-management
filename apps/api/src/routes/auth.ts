import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../db/client';
import { SESSION_TTL_SECONDS, getUser, login } from '../services/auth';

export const SESSION_COOKIE = 'session';

export interface AuthRoutesDeps {
  database: Database;
  jwtSecret: string;
  secureCookies: boolean;
  now: () => Date;
}

const credentialsSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

const emailResponseSchema = z.object({ email: z.string() });
const errorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export const authRoutes =
  ({ database, jwtSecret, secureCookies, now }: AuthRoutesDeps): FastifyPluginAsyncZod =>
  (app) => {
    const cookieOptions = {
      httpOnly: true,
      sameSite: 'strict' as const,
      path: '/',
      secure: secureCookies,
    };

    app.post(
      '/api/auth/login',
      {
        schema: {
          body: credentialsSchema,
          response: { 200: emailResponseSchema, 401: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const result = await login(database.db, request.body, { jwtSecret, clock: now });
        if (!result) {
          return reply.code(401).send({
            error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
          });
        }
        void reply.setCookie(SESSION_COOKIE, result.token, {
          ...cookieOptions,
          maxAge: SESSION_TTL_SECONDS,
        });
        return { email: result.user.email };
      },
    );

    app.post('/api/auth/logout', (_request, reply) => {
      void reply.clearCookie(SESSION_COOKIE, cookieOptions);
      return reply.code(204).send();
    });

    app.get(
      '/api/auth/me',
      { schema: { response: { 200: emailResponseSchema, 401: errorResponseSchema } } },
      async (request, reply) => {
        const user = request.userId === null ? undefined : getUser(database.db, request.userId);
        if (!user) {
          return reply.code(401).send({
            error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
          });
        }
        return { email: user.email };
      },
    );

    return Promise.resolve();
  };
