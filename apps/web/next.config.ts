import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// Everything the app loads is its own: scripts, styles, self-hosted fonts and the same-origin API.
// Next.js inlines its bootstrap scripts and styles, so those need 'unsafe-inline'; the dev server's
// fast refresh also needs 'unsafe-eval'. frame-ancestors 'none' stops the app being framed.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

const nextConfig: NextConfig = {
  agentRules: false,
  transpilePackages: ['@acme/shared'],
  output: 'standalone',
  poweredByHeader: false,
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }]);
  },
  rewrites() {
    // Rewrite destinations are resolved at build time, so API_URL must be set when running `next build`.
    return Promise.resolve([
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL ?? 'http://localhost:3001'}/api/:path*`,
      },
    ]);
  },
};

export default nextConfig;
