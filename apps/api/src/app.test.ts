import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp } from './test/test-app';

describe('app', () => {
  let current: Awaited<ReturnType<typeof createTestApp>> | undefined;

  afterEach(async () => {
    await current?.app.close();
    current?.database.close();
    current = undefined;
  });

  it('answers an unknown api route with a JSON 404 in the standard error shape', async () => {
    current = await createTestApp();
    const cookie = await current.loginCookie();

    const response = await current.app.inject({
      method: 'GET',
      url: '/api/does-not-exist',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route GET /api/does-not-exist not found' },
    });
  });
});
