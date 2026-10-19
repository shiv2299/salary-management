import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const apiRoot = resolve(import.meta.dirname, '..');

describe('loadConfig', () => {
  it('applies defaults when the environment is empty', () => {
    const { JWT_SECRET, ...rest } = loadConfig({});

    expect(rest).toEqual({
      NODE_ENV: 'development',
      PORT: 3001,
      HOST: '0.0.0.0',
      DATABASE_PATH: resolve(apiRoot, 'data/app.db'),
      LOG_LEVEL: 'info',
    });
    expect(JWT_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it('resolves a relative database path against the api package', () => {
    expect(loadConfig({ DATABASE_PATH: 'other/test.db' }).DATABASE_PATH).toBe(
      resolve(apiRoot, 'other/test.db'),
    );
  });

  it('keeps absolute and in-memory database paths unchanged', () => {
    expect(loadConfig({ DATABASE_PATH: '/var/lib/app.db' }).DATABASE_PATH).toBe('/var/lib/app.db');
    expect(loadConfig({ DATABASE_PATH: ':memory:' }).DATABASE_PATH).toBe(':memory:');
  });

  it('parses the port from a string', () => {
    expect(loadConfig({ PORT: '4000' }).PORT).toBe(4000);
  });

  it('throws a readable error naming every invalid variable', () => {
    expect(() => loadConfig({ PORT: 'abc', NODE_ENV: 'staging' })).toThrow(
      /Invalid environment configuration:\n {2}NODE_ENV: .*\n {2}PORT: /,
    );
  });

  it('requires a JWT secret of at least 32 characters in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) }).JWT_SECRET).toBe(
      'x'.repeat(32),
    );
  });
});
