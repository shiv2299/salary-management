import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, apiGet, apiSend } from './api';

const okSchema = z.object({ ok: z.boolean() });

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('apiSend', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a JSON body with a JSON content type', async () => {
    const fetchMock = stubFetch(Response.json({ ok: true }));

    await apiSend('POST', '/api/things', okSchema, { name: 'a' });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"name":"a"}');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
  });

  it('sends no content type and no body when there is nothing to send', async () => {
    const fetchMock = stubFetch(Response.json({ ok: true }));

    await apiSend('DELETE', '/api/employees/1', okSchema);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).has('content-type')).toBe(false);
  });

  it('throws a typed error carrying the status and server message on failure', async () => {
    stubFetch(
      Response.json({ error: { code: 'STALE', message: 'Preview again' } }, { status: 409 }),
    );

    const error = await apiSend('POST', '/api/x', okSchema, {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'STALE', message: 'Preview again' });
  });

  it('reports a response body that does not match the expected shape as an error', async () => {
    stubFetch(Response.json({ nope: 1 }));

    await expect(apiGet('/api/x', okSchema)).rejects.toThrow();
  });
});
