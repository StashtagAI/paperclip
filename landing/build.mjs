#!/usr/bin/env node
// Builds the static landing site into dist/. No dependencies: needs Node 18+ only.
//
//   node build.mjs
//
// Reads site.config.json (domain, contact email, store links) and src/content.mjs (all copy), renders every page
// with its CSS and script inlined, and writes robots.txt, sitemap.xml, llms.txt and llms-full.txt from the same data.
// public/ is copied into dist/ unchanged.

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as content from './src/content.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
const legalDir = join(root, '..', 'legal');

const config = JSON.parse(readFileSync(join(root, 'site.config.json'), 'utf8'));
const site = new URL(config.siteUrl);
if (site.protocol !== 'https:' || site.pathname !== '/') throw new Error('siteUrl must be an https origin ending in /');
for (const [key, store] of [['appStore', config.appStore], ['googlePlay', config.googlePlay]]) {
  if (store.url && !/^https:\/\//.test(store.url)) throw new Error(`${key}.url must be an https URL or empty`);
}

const abs = (path = '') => new URL(path, site).href;
const ios = config.appStore.url ? config.appStore : null;
const android = config.googlePlay.url ? config.googlePlay : null;
const css = readFileSync(join(root, 'src', 'styles.css'), 'utf8').trim();
const js = readFileSync(join(root, 'src', 'platform.js'), 'utf8').trim();
const year = new Date().getFullYear();

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sha256 = (s) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`;
// Stops a "</script>" inside a string from closing the JSON-LD block.
const jsonLd = (data) => JSON.stringify(data, null, 2).replace(/</g, '\\u003c');

// ---------------------------------------------------------------------------------------------------------------
// Store buttons

/** One store button: a link when the listing exists, otherwise a "Coming soon" label that links nowhere. */
function storeButton(store, platform, name) {
  const body = (small) => `<span class="store-small">${small}</span> <span class="store-name">${name}</span>`;
  if (store) {
    return `<li data-platform="${platform}"><a class="store" href="${esc(store.url)}">${body('Download on')}</a></li>`;
  }
  return `<li data-platform="${platform}"><p class="store store-soon">${body('Coming soon to')}</p></li>`;
}

const stores = (label) =>
  `<ul class="stores" aria-label="${esc(label)}">
          ${storeButton(ios, 'ios', 'App Store')}
          ${storeButton(android, 'android', 'Google Play')}
        </ul>`;

// ---------------------------------------------------------------------------------------------------------------
// Structured data

const org = { '@id': abs('#organization') };
const appDownloadUrls = [ios?.url, android?.url].filter(Boolean);

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      ...org,
      name: config.name,
      url: abs(),
      logo: { '@type': 'ImageObject', url: abs('assets/icon-512.png'), width: 512, height: 512 },
      email: config.contactEmail,
      contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: config.contactEmail },
      ...(appDownloadUrls.length ? { sameAs: appDownloadUrls } : {}),
    },
    {
      '@type': 'WebSite',
      '@id': abs('#website'),
      url: abs(),
      name: config.name,
      description: content.description,
      inLanguage: 'en',
      publisher: org,
    },
    {
      '@type': 'MobileApplication',
      '@id': abs('#app'),
      name: config.name,
      description: content.valueProp,
      url: abs(),
      image: abs('assets/og.png'),
      operatingSystem: 'iOS, Android',
      applicationCategory: 'LifestyleApplication',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: org,
      ...(appDownloadUrls.length ? { downloadUrl: appDownloadUrls, installUrl: appDownloadUrls } : {}),
    },
    {
      '@type': 'FAQPage',
      '@id': abs('#faq'),
      url: abs(),
      isPartOf: { '@id': abs('#website') },
      mainEntity: content.faq.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Page shell

const OG_ALT = `${config.name}: save Instagram and TikTok posts, get organized lists such as Eats › Restaurants › Denver. Shown beside the app's home screen.`;

function page({ path, title, description, main, structured = null, script = false, index = true }) {
  const url = abs(path);
  const csp = [
    "default-src 'none'",
    "img-src 'self'",
    // Same-origin fetches only, so in-page tools such as Lighthouse can read robots.txt and llms.txt.
    "connect-src 'self'",
    `style-src ${sha256(css)}`,
    script ? `script-src ${sha256(js)}` : "script-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  const smartBanner =
    path === '' && ios?.appId ? `\n    <meta name="apple-itunes-app" content="app-id=${esc(ios.appId)}">` : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    ${index ? `<link rel="canonical" href="${url}">\n    <meta name="robots" content="index, follow, max-image-preview:large">` : '<meta name="robots" content="noindex">'}
    <meta name="color-scheme" content="light dark">
    <meta name="theme-color" content="#F4F9FF" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#0A1420" media="(prefers-color-scheme: dark)">${smartBanner}
    <link rel="icon" href="/favicon.ico" sizes="32x32">
    <link rel="icon" href="/assets/icon-192.png" type="image/png" sizes="192x192">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <link rel="alternate" type="text/plain" href="/llms.txt" title="LLM-readable summary">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${esc(config.name)}">
    <meta property="og:url" content="${url}">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:image" content="${abs('assets/og.png')}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="${esc(OG_ALT)}">
    <meta property="og:locale" content="en_US">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(title)}">
    <meta name="twitter:description" content="${esc(description)}">
    <meta name="twitter:image" content="${abs('assets/og.png')}">
    <meta name="twitter:image:alt" content="${esc(OG_ALT)}">
    <style>${css}</style>${
      structured ? `\n    <script type="application/ld+json">\n${jsonLd(structured)}\n    </script>` : ''
    }
  </head>
  <body>
    <a class="skip" href="#main">Skip to content</a>
    <header class="site-header">
      <div class="wrap">
        <a class="brand" href="/"><img src="/assets/icon-96.png" alt="" width="32" height="32">${esc(config.name)}</a>
      </div>
    </header>
    <main id="main">
${main}
    </main>
    <footer class="site-footer">
      <div class="wrap">
        <nav aria-label="Legal and support">
          <ul class="footer-links">
            ${content.legalPages.map((p) => `<li><a href="/${p.slug}/">${esc(p.label)}</a></li>`).join('\n            ')}
            <li><a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a></li>
          </ul>
        </nav>
        <p>© ${year} ${esc(config.name)}</p>
      </div>
    </footer>${script ? `\n    <script>${js}</script>` : ''}
  </body>
</html>
`;
}

// ---------------------------------------------------------------------------------------------------------------
// Home page

const home = `      <section class="hero" aria-labelledby="hero-title">
        <div class="wrap hero-grid">
          <div class="hero-copy">
            <h1 id="hero-title">${esc(config.name)}</h1>
            <p class="tagline">${esc(content.tagline)}</p>
            <p class="lede">${esc(content.valueProp)}</p>
            ${stores(`Get ${config.name}`)}
          </div>
          <picture class="hero-shot">
            <source srcset="/assets/home-dark.webp" media="(prefers-color-scheme: dark)" type="image/webp">
            <source srcset="/assets/home-light.webp" type="image/webp">
            <img src="/assets/home-light.png" width="295" height="640" fetchpriority="high"
              alt="The StashtagAI home screen: tiles for Eats, Trips, Recipes and Do, above a Recently stashed list of a café, a ridge walk and a recipe saved from Instagram.">
          </picture>
        </div>
      </section>

      <section class="section" aria-labelledby="how-title">
        <div class="wrap">
          <h2 id="how-title">How it works</h2>
          <ol class="steps">
            ${content.steps
              .map((s) => `<li><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`)
              .join('\n            ')}
          </ol>
        </div>
      </section>

      <section class="section section-alt" aria-labelledby="features-title">
        <div class="wrap">
          <h2 id="features-title">What you get</h2>
          <ul class="features">
            ${content.features
              .map((f) => `<li class="kind-${f.kind}"><h3>${esc(f.title)}</h3><p>${esc(f.text)}</p></li>`)
              .join('\n            ')}
          </ul>
        </div>
      </section>

      <section class="section" aria-labelledby="faq-title">
        <div class="wrap narrow">
          <h2 id="faq-title">Questions and answers</h2>
          <dl class="faq">
            ${content.faq.map(({ q, a }) => `<div><dt>${esc(q)}</dt><dd>${esc(a)}</dd></div>`).join('\n            ')}
          </dl>
        </div>
      </section>

      <section class="section section-alt cta" aria-labelledby="cta-title">
        <div class="wrap">
          <h2 id="cta-title">Turn your saved posts into plans</h2>
          ${stores(`Get ${config.name}`)}
        </div>
      </section>`;

// ---------------------------------------------------------------------------------------------------------------
// Legal pages: a small Markdown subset (headings, paragraphs, lists, bold, italics, links, rules) is all ../legal uses.

const legalSlugs = Object.fromEntries(content.legalPages.map((p) => [p.file, p.slug]));

function inline(text) {
  return esc(text)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
      const file = href.replace(/^\.\//, '');
      const target = legalSlugs[file] ? `/${legalSlugs[file]}/` : href;
      return `<a href="${target}">${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

function markdown(md) {
  const out = [];
  let para = [];
  let list = null;
  const flush = () => {
    // ../legal never soft-wraps prose, so a line break inside a paragraph (e.g. the date lines) is meant.
    if (para.length) out.push(`<p>${para.map(inline).join('<br>\n')}</p>`);
    para = [];
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  for (const line of md.split('\n')) {
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (heading) {
      flush();
      // Each legal file has exactly one "#" heading, which becomes the page's only h1.
      out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
    } else if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      flush();
      out.push('<hr>');
    } else if (bullet || numbered) {
      const tag = bullet ? 'ul' : 'ol';
      if (para.length || (list && list.tag !== tag)) flush();
      list ??= { tag, items: [] };
      list.items.push((bullet ?? numbered)[1]);
    } else if (!line.trim()) {
      flush();
    } else if (list && /^\s+/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
    } else {
      if (list) flush();
      para.push(line.trim());
    }
  }
  flush();
  return out.join('\n');
}

function legalPage({ file, slug, label }) {
  const md = readFileSync(join(legalDir, file), 'utf8');
  const html = markdown(md);
  const firstPara = md
    .split('\n')
    .find((l) => l.trim() && !l.startsWith('#') && !l.startsWith('**'))
    ?.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*/g, '');
  return page({
    path: `${slug}/`,
    title: `${label} | ${config.name}`,
    description: firstPara?.slice(0, 155) ?? `${config.name} ${label}`,
    main: `      <article class="section legal">
        <div class="wrap narrow">
          ${html}
        </div>
      </article>`,
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Text files for crawlers

const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'Bingbot',
];

const robots = `# ${config.name}: everything here is public and may be crawled, indexed and used by AI search and assistants.
${AI_CRAWLERS.map((bot) => `User-agent: ${bot}\nAllow: /`).join('\n\n')}

User-agent: *
Allow: /

Sitemap: ${abs('sitemap.xml')}
`;

const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['', ...content.legalPages.map((p) => `${p.slug}/`)]
  .map((path) => `  <url><loc>${abs(path)}</loc><lastmod>${today}</lastmod></url>`)
  .join('\n')}
</urlset>
`;

const storeLine = (store, name) => (store ? `${name}: ${store.url}` : `${name}: coming soon`);

const llms = `# ${config.name}

> ${content.valueProp}

${config.name} is a mobile app for iPhone (iOS) and Android. It is free to download.

## Get the app

- ${storeLine(ios, 'App Store (iPhone)')}
- ${storeLine(android, 'Google Play (Android)')}
- Website: ${abs()}

## How it works

${content.steps.map((s, i) => `${i + 1}. ${s.title}: ${s.text}`).join('\n')}

## Features

${content.features.map((f) => `- ${f.title}: ${f.text}`).join('\n')}

## FAQ

${content.faq.map(({ q, a }) => `### ${q}\n\n${a}`).join('\n\n')}

## Links

${content.legalPages.map((p) => `- [${p.label}](${abs(`${p.slug}/`)})`).join('\n')}
- Contact: ${config.contactEmail}
`;

const llmsFull = `${llms}
${content.legalPages
  .map((p) => `---\n\nSource: ${abs(`${p.slug}/`)}\n\n${readFileSync(join(legalDir, p.file), 'utf8').trim()}\n`)
  .join('\n')}`;

// ---------------------------------------------------------------------------------------------------------------
// Write

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
if (existsSync(join(root, 'public'))) cpSync(join(root, 'public'), dist, { recursive: true });

const write = (path, body) => {
  mkdirSync(dirname(join(dist, path)), { recursive: true });
  writeFileSync(join(dist, path), body);
};

write(
  'index.html',
  page({ path: '', title: content.title, description: content.description, main: home, structured: structuredData, script: true }),
);
for (const p of content.legalPages) write(`${p.slug}/index.html`, legalPage(p));
write(
  '404.html',
  page({
    path: '404.html',
    title: `Page not found | ${config.name}`,
    description: content.description,
    main: `      <section class="section">
        <div class="wrap narrow">
          <h1>Page not found</h1>
          <p>That page doesn't exist. <a href="/">Go to the ${esc(config.name)} home page</a>.</p>
        </div>
      </section>`,
    index: false,
  }),
);
write('robots.txt', robots);
write('sitemap.xml', sitemap);
write('llms.txt', llms);
write('llms-full.txt', llmsFull);

console.log(`Built ${dist} for ${abs()}`);
console.log(`  App Store: ${ios ? ios.url : 'coming soon'}${ios?.appId ? ` (smart banner app-id ${ios.appId})` : ''}`);
console.log(`  Google Play: ${android ? android.url : 'coming soon'}`);
