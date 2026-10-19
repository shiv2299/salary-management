import { afterEach, describe, expect, it } from 'vitest';
import { HR_EMAIL, HR_PASSWORD, createTestApp } from '../test/test-app';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
let current: TestApp | undefined;

async function setup(options?: Parameters<typeof createTestApp>[0]) {
  current = await createTestApp(options);
  return current;
}

afterEach(async () => {
  await current?.app.close();
  current?.database.close();
  current = undefined;
});

const login = (t: TestApp, payload: unknown) =>
  t.app.inject({ method: 'POST', url: '/api/auth/login', payload: payload as object });

describe('POST /api/auth/login', () => {
  it('sets an HttpOnly, SameSite=Strict session cookie and returns the email', async () => {
    const t = await setup();

    const response = await login(t, { email: HR_EMAIL, password: HR_PASSWORD });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ email: HR_EMAIL });
    const cookie = String(response.headers['set-cookie']);
    expect(cookie).toMatch(/^session=[^;]+/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=28800');
    expect(cookie).not.toContain('Secure');
  });

  it('marks the cookie Secure in production', async () => {
    const t = await setup({ secureCookies: true });

    const response = await login(t, { email: HR_EMAIL, password: HR_PASSWORD });

    expect(String(response.headers['set-cookie'])).toContain('Secure');
  });

  it('answers a wrong password with 401 in the standard error shape and no cookie', async () => {
    const t = await setup();

    const response = await login(t, { email: HR_EMAIL, password: 'nope' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('answers an unknown email exactly like a wrong password', async () => {
    const t = await setup();

    const response = await login(t, { email: 'nobody@acme.test', password: HR_PASSWORD });

    expect(response.statusCode).toBe(401);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects a body with missing fields with a validation error', async () => {
    const t = await setup();

    const response = await login(t, { email: HR_EMAIL });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a form-encoded body so a cross-site form cannot log in', async () => {
    const t = await setup();

    const response = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `email=${HR_EMAIL}&password=${HR_PASSWORD}`,
    });

    expect(response.statusCode).toBe(415);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the logged-in email when the session cookie is sent', async () => {
    const t = await setup();
    const cookie = await t.loginCookie();

    const response = await t.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ email: HR_EMAIL });
  });

  it('answers 401 without a session', async () => {
    const t = await setup();

    const response = await t.app.inject({ method: 'GET', url: '/api/auth/me' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
    });
  });

  it('answers 401 for a tampered cookie', async () => {
    const t = await setup();
    const cookie = `${await t.loginCookie()}x`;

    const response = await t.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(401);
  });

  it('answers 401 once the eight hours are up', async () => {
    let now = new Date('2026-01-15T09:00:00.000Z');
    const t = await setup({ now: () => now });
    const cookie = await t.loginCookie();

    now = new Date('2026-01-15T16:59:00.000Z');
    const stillValid = await t.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    });
    now = new Date('2026-01-15T17:01:00.000Z');
    const expired = await t.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });

    expect(stillValid.statusCode).toBe(200);
    expect(expired.statusCode).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session cookie', async () => {
    const t = await setup();
    const cookie = await t.loginCookie();

    const response = await t.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(204);
    const cleared = String(response.headers['set-cookie']);
    expect(cleared).toMatch(/^session=;/);
    expect(cleared).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });
});

describe('deny by default', () => {
  it('answers 401 on a registered route nobody exempted', async () => {
    const t = await setup();
    t.app.get('/api/anything', () => ({ ok: true }));

    const response = await t.app.inject({ method: 'GET', url: '/api/anything' });

    expect(response.statusCode).toBe(401);
  });

  it('answers an unmatched path with 401 until the caller has a session', async () => {
    const t = await setup();

    const response = await t.app.inject({ method: 'GET', url: '/api/employees' });

    expect(response.statusCode).toBe(401);
  });

  it('keeps the health check public', async () => {
    const t = await setup();

    const response = await t.app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
  });

  it('lets a logged-in user through to the not-found handler', async () => {
    const t = await setup();
    const cookie = await t.loginCookie();

    const response = await t.app.inject({
      method: 'GET',
      url: '/api/does-not-exist',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(404);
  });

  it('cannot be bypassed by percent-encoding part of the path', async () => {
    const t = await setup();
    t.app.get('/api/secret', () => ({ secret: true }));

    const plain = await t.app.inject({ method: 'GET', url: '/api/secret' });
    const encoded = await t.app.inject({ method: 'GET', url: '/%61pi/secret' });
    const withQuery = await t.app.inject({ method: 'GET', url: '/api/secret?x=/api/health' });

    expect(plain.statusCode).toBe(401);
    expect(encoded.statusCode).toBe(401);
    expect(withQuery.statusCode).toBe(401);
  });
});
