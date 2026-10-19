import { z } from 'zod';

const errorBodySchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiPath = `/api/${string}`;

async function request<T>(
  method: string,
  path: ApiPath,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = { method };
  // The API accepts JSON only and rejects a JSON content type on an empty body, so the header is
  // sent only when there is a body.
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server');
  }

  const parsedBody: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const parsed = errorBodySchema.safeParse(parsedBody);
    if (parsed.success) {
      throw new ApiError(response.status, parsed.data.error.code, parsed.data.error.message);
    }
    throw new ApiError(
      response.status,
      'UNKNOWN_ERROR',
      `Request failed with status ${response.status}`,
    );
  }

  return schema.parse(parsedBody);
}

export function apiGet<T>(path: ApiPath, schema: z.ZodType<T>): Promise<T> {
  return request('GET', path, schema);
}

export function apiSend<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: ApiPath,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  return request(method, path, schema, body);
}
