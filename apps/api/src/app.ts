import fastifyCookie from '@fastify/cookie';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { Database } from './db/client';
import { authRoutes, SESSION_COOKIE } from './routes/auth';
import { employeeRoutes } from './routes/employees';
import { healthRoutes } from './routes/health';
import { insightRoutes } from './routes/insights';
import { referenceRoutes } from './routes/reference';
import { verifySessionToken } from './services/auth';

declare module 'fastify' {
  interface FastifyRequest {
    /** The logged-in user's id, or null when the request carries no valid session. */
    userId: number | null;
  }
}

// Every other route requires a session, so a new route is protected without anyone
// remembering to add it (architecture §4).
const PUBLIC_ROUTES = new Set(['POST /api/auth/login', 'GET /api/health', 'HEAD /api/health']);

export interface AppDeps {
  database: Database;
  jwtSecret: string;
  secureCookies: boolean;
  now?: () => Date;
  logger?: FastifyServerOptions['logger'];
}

function toClientError(
  error: unknown,
): { statusCode: number; code: string; message: string } | undefined {
  if (!(error instanceof Error) || isResponseSerializationError(error)) return undefined;
  const { statusCode, code } = error as Error & { statusCode?: unknown; code?: unknown };
  if (typeof statusCode !== 'number' || statusCode < 400 || statusCode >= 500) return undefined;
  return {
    statusCode,
    code: typeof code === 'string' ? code : 'BAD_REQUEST',
    message: error.message,
  };
}

export function buildApp({
  database,
  jwtSecret,
  secureCookies,
  now = () => new Date(),
  logger = false,
}: AppDeps): FastifyInstance {
  const app = Fastify({ logger });

  // Only JSON bodies are accepted, so a cross-site HTML form (urlencoded, multipart or text/plain)
  // cannot drive a mutating endpoint (architecture §4). Fastify parses text/plain by default.
  app.removeContentTypeParser('text/plain');

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  void app.register(fastifyCookie);
  app.decorateRequest('userId', null);

  app.addHook('onRequest', async (request, reply) => {
    // Set first, so it is on every response, a 401 included: the API sends JSON and CSV only, and
    // a browser must never reinterpret either as HTML.
    void reply.header('x-content-type-options', 'nosniff');

    // Decide from the route Fastify matched, never from the raw URL: the router decodes the path
    // (`/%61pi/x` reaches `/api/x`), so a string match on request.url could be bypassed. A request
    // that matched no route has no pattern, so it is never public and needs a session like the rest.
    const routeUrl = request.routeOptions.url ?? '';

    const token = fastifyCookie.parse(request.headers.cookie ?? '')[SESSION_COOKIE];
    const session = token ? await verifySessionToken(token, jwtSecret, now()) : null;
    request.userId = session?.userId ?? null;

    if (!session && !PUBLIC_ROUTES.has(`${request.method} ${routeUrl}`)) {
      return reply.code(401).send({
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const message = error.validation
        .map((issue) => `${issue.instancePath || 'request'}: ${issue.message}`)
        .join('; ');
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message } });
    }

    const clientError = toClientError(error);
    if (!clientError) {
      request.log.error(error);
      return reply
        .code(500)
        .send({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
    return reply
      .code(clientError.statusCode)
      .send({ error: { code: clientError.code, message: clientError.message } });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found` },
    }),
  );

  void app.register(healthRoutes(database));
  void app.register(authRoutes({ database, jwtSecret, secureCookies, now }));
  void app.register(referenceRoutes(database));
  void app.register(employeeRoutes({ database, now }));
  void app.register(insightRoutes({ database, now }));

  return app;
}
