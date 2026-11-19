#!/usr/bin/env node
// Checks a built dist/ (run `npm run check`): the things a copy or colour edit could quietly break.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as content from './src/content.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(root, 'dist', path), 'utf8');
const config = JSON.parse(readFileSync(join(root, 'site.config.json'), 'utf8'));
const failures = [];
const check = (ok, message) => ok || failures.push(message);
const decode = (s) =>
  s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]);

const html = read('index.html');

// One h1 per page, and every page has a title, description and canonical (404 excepted).
for (const path of ['index.html', ...content.legalPages.map((p) => `${p.slug}/index.html`)]) {
  const page = read(path);
  check((page.match(/<h1[\s>]/g) ?? []).length === 1, `${path}: expected exactly one <h1>`);
  check(/<title>[^<]+<\/title>/.test(page), `${path}: missing <title>`);
  check(/<meta name="description" content="[^"]+">/.test(page), `${path}: missing meta description`);
  check(/<link rel="canonical" href="https:\/\/[^"]+">/.test(page), `${path}: missing canonical`);
  check(!/href=""/.test(page), `${path}: empty href`);
}

// JSON-LD parses, and the FAQPage matches the visible FAQ word for word.
const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
  JSON.parse(m[1]),
);
const graph = blocks.flatMap((b) => b['@graph'] ?? [b]);
for (const type of ['Organization', 'WebSite', 'MobileApplication', 'FAQPage']) {
  check(graph.some((n) => n['@type'] === type), `JSON-LD: missing ${type}`);
}
const app = graph.find((n) => n['@type'] === 'MobileApplication');
check(app?.offers?.price === '0', 'JSON-LD: MobileApplication offer price should be 0');
const faqLd = graph.find((n) => n['@type'] === 'FAQPage')?.mainEntity ?? [];
const faqHtml = [...html.matchAll(/<dt>([^<]*)<\/dt><dd>([^<]*)<\/dd>/g)].map((m) => [decode(m[1]), decode(m[2])]);
check(faqHtml.length === content.faq.length, `FAQ: ${faqHtml.length} visible Q&As, expected ${content.faq.length}`);
faqHtml.forEach(([q, a], i) => {
  check(faqLd[i]?.name === q && faqLd[i]?.acceptedAnswer?.text === a, `FAQ ${i + 1}: JSON-LD differs from the page`);
});

// Store links: no link until the listing exists; the smart banner only with an App Store ID.
check(
  config.appStore.url ? html.includes(`href="${config.appStore.url}"`) : !/apps\.apple\.com/.test(html),
  'App Store link does not match site.config.json',
);
check(
  config.googlePlay.url ? html.includes(`href="${config.googlePlay.url}"`) : !/play\.google\.com/.test(html),
  'Google Play link does not match site.config.json',
);
check(html.includes('apple-itunes-app') === Boolean(config.appStore.appId), 'Smart app banner does not match appId');

// robots.txt allows the AI crawlers by name and points at the sitemap.
const robots = read('robots.txt');
for (const bot of ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User',
  'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'Bingbot']) {
  check(new RegExp(`User-agent: ${bot}\\nAllow: /`).test(robots), `robots.txt: ${bot} not allowed`);
}
check(robots.includes(`Sitemap: ${new URL('sitemap.xml', config.siteUrl).href}`), 'robots.txt: missing Sitemap');
check(content.faq.every(({ q }) => read('llms.txt').includes(q)), 'llms.txt: missing FAQ questions');

// Text contrast ≥ 4.5:1 in every colour scheme the stylesheet defines.
const css = readFileSync(join(root, 'src', 'styles.css'), 'utf8');
const vars = (selector) => {
  // The first "}" after the selector closes its :root block (media queries wrap a single :root).
  const start = css.indexOf(selector);
  const block = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
};
const light = vars(':root {');
const dark = { ...light, ...vars('@media (prefers-color-scheme: dark) {') };
const schemes = {
  light,
  dark,
  'light, more contrast': { ...light, ...vars('@media (prefers-contrast: more) {') },
  'dark, more contrast': { ...dark, ...vars('@media (prefers-contrast: more) and (prefers-color-scheme: dark) {') },
};
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const textPairs = [
  ['text', 'bg'], ['text', 'bg-alt'], ['muted', 'bg'], ['muted', 'bg-alt'], ['link', 'bg'], ['link', 'bg-alt'],
  ['store-text', 'store-bg'],
];
for (const [name, v] of Object.entries(schemes)) {
  for (const [fg, bg] of textPairs) {
    const r = ratio(v[fg], v[bg]);
    check(r >= 4.5, `${name}: --${fg} on --${bg} is ${r.toFixed(2)}:1, needs 4.5:1`);
  }
  // Non-text: the dashed "Coming soon" outline and focus ring need 3:1 against the page.
  for (const [fg, bg] of [['outline', 'bg'], ['outline', 'bg-alt'], ['focus', 'bg'], ['focus', 'bg-alt']]) {
    const r = ratio(v[fg], v[bg]);
    check(r >= 3, `${name}: --${fg} on --${bg} is ${r.toFixed(2)}:1, needs 3:1`);
  }
}

if (failures.length) {
  console.error(`✗ ${failures.length} check(s) failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('✓ landing checks passed');
