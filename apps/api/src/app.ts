import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { Database } from './db/client';
import { healthRoutes } from './routes/health';

export interface AppDeps {
  database: Database;
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

export function buildApp({ database, logger = false }: AppDeps): FastifyInstance {
  const app = Fastify({ logger });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

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

  return app;
}
