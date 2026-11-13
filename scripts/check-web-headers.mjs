// Checks a web export (HAN-39): Expo Hosting only serves our security headers when `_expo/.routes.json` carries them
// (static output), and the CSP must allow every inline <script> the export writes. Run after
// `expo export --platform web`; an Expo upgrade that changes the inline hydrate script fails here, not in the browser.
// Usage: node scripts/check-web-headers.mjs [distDir]
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const REQUIRED = [
  'Content-Security-Policy',
  'Strict-Transport-Security',
  'X-Frame-Options',
  'X-Content-Type-Options',
  'Referrer-Policy',
  'Permissions-Policy',
];

const fail = (msg) => {
  console.error(`check-web-headers: ${msg}`);
  process.exitCode = 1;
};

let routes;
try {
  routes = JSON.parse(await readFile(join(dist, '_expo/.routes.json'), 'utf8'));
} catch {
  fail(`${dist}/_expo/.routes.json missing; is web.output "static" in app.json?`);
  process.exit();
}

const headers = routes.headers ?? {};
for (const name of REQUIRED) if (!headers[name]) fail(`header ${name} not set`);

const csp = String(headers['Content-Security-Policy'] ?? '');
const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src')) ?? '';
if (/'unsafe-inline'|'unsafe-eval'/.test(scriptSrc)) fail(`script-src must not allow unsafe-inline/unsafe-eval`);
if (!/frame-ancestors 'none'/.test(csp)) fail(`CSP needs frame-ancestors 'none'`);

const htmlFiles = (await readdir(dist, { recursive: true })).filter((f) => f.endsWith('.html'));
if (htmlFiles.length === 0) fail('no HTML files in export');
for (const file of htmlFiles) {
  const html = await readFile(join(dist, file), 'utf8');
  for (const [, attrs, body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\bsrc=/.test(attrs) || body === '') continue;
    const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
    if (!scriptSrc.includes(hash)) fail(`${file}: inline script not allowed by CSP; add ${hash} to script-src`);
  }
}

if (!process.exitCode) console.log(`check-web-headers: ok (${htmlFiles.length} pages)`);
