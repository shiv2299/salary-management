import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('applies defaults when the environment is empty', () => {
    expect(loadConfig({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3001,
      HOST: '0.0.0.0',
      DATABASE_PATH: './data/app.db',
      LOG_LEVEL: 'info',
    });
  });

  it('parses the port from a string', () => {
    expect(loadConfig({ PORT: '4000' }).PORT).toBe(4000);
  });

  it('throws a readable error naming every invalid variable', () => {
    expect(() => loadConfig({ PORT: 'abc', NODE_ENV: 'staging' })).toThrow(
      /Invalid environment configuration:\n {2}NODE_ENV: .*\n {2}PORT: /,
    );
  });
});
