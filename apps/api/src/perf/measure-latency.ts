import { buildApp } from '../app';
import { loadConfig } from '../config';
import { createDatabase } from '../db/client';

// Measures list, facet, insight, peer-context and salary-preview latency in-process against an
// already seeded database, so network and the Next.js rewrite are excluded. See
// docs/performance.md for the method and the figures.
const WARM_UP = 5;
const TIMED = 40;
// Used only when JWT_SECRET is unset; the app never listens, so the value does not matter.
const LOCAL_JWT_SECRET = 'local-latency-measurement-secret-32+';

interface Case {
  method: 'GET' | 'POST';
  url: string;
  payload?: object;
}

// The first seeded employee, active at the reference date, for the per-employee endpoints.
const EMPLOYEE_ID = 1;

const GET_URLS = [
  '/api/employees',
  '/api/employees?sortBy=jobTitle&sortOrder=desc',
  '/api/employees?sortBy=department&sortOrder=desc',
  '/api/employees?sortBy=level&sortOrder=desc',
  '/api/employees?sortBy=country&sortOrder=desc',
  '/api/employees?status=all&sortBy=department&offset=9000',
  '/api/employees?country=IN&country=DE&level=3&level=4',
  '/api/employees/facets',
  '/api/employees/facets?search=ann&country=IN',
  '/api/insights/distribution?groupBy=country',
  '/api/insights/outliers',
  '/api/insights/payroll?groupBy=department',
  '/api/insights/recent-changes?years=5',
  `/api/employees/${EMPLOYEE_ID}/peer-context`,
];

const CASES: Case[] = [
  ...GET_URLS.map((url): Case => ({ method: 'GET', url })),
  {
    method: 'POST',
    url: `/api/employees/${EMPLOYEE_ID}/salary-changes/preview`,
    payload: { reason: 'raise', percentageBp: 500 },
  },
  {
    method: 'POST',
    url: '/api/employees/bulk-salary-changes/preview',
    payload: { filter: {}, percentageBp: 700 },
  },
  {
    method: 'POST',
    url: '/api/employees/bulk-salary-changes/summary',
    payload: { filter: {}, percentageBp: 700 },
  },
];

/** Nearest-rank percentile of an ascending list. */
function percentile(sorted: number[], p: number): number {
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.max(rank, 1) - 1]!;
}

const config = loadConfig();
if (!config.HR_SEED_EMAIL || !config.HR_SEED_PASSWORD) {
  console.error('HR_SEED_EMAIL and HR_SEED_PASSWORD are required to log in.');
  process.exit(1);
}

const database = createDatabase(config.DATABASE_PATH);
const app = buildApp({
  database,
  jwtSecret: config.JWT_SECRET.length >= 32 ? config.JWT_SECRET : LOCAL_JWT_SECRET,
  secureCookies: false,
});

try {
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: config.HR_SEED_EMAIL, password: config.HR_SEED_PASSWORD },
  });
  if (login.statusCode !== 200) throw new Error(`login failed with ${login.statusCode}`);
  const header = login.headers['set-cookie'];
  const cookie = String(Array.isArray(header) ? header[0] : header).split(';')[0]!;

  console.log('| Case | p50 ms | p95 ms |');
  console.log('|---|---|---|');
  for (const { method, url, payload } of CASES) {
    const durations: number[] = [];
    for (let i = 0; i < WARM_UP + TIMED; i++) {
      const started = performance.now();
      const response = await app.inject({
        method,
        url,
        headers: { cookie },
        ...(payload ? { payload } : {}),
      });
      const elapsed = performance.now() - started;
      if (response.statusCode !== 200) throw new Error(`${url} answered ${response.statusCode}`);
      if (i >= WARM_UP) durations.push(elapsed);
    }
    durations.sort((a, b) => a - b);
    console.log(
      `| \`${method} ${url}\` | ${percentile(durations, 50).toFixed(1)} | ${percentile(durations, 95).toFixed(1)} |`,
    );
  }
} finally {
  await app.close();
  database.close();
}
