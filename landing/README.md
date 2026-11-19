# StashtagAI landing page

The public site at `https://stashtag.ai/` (HAN-96). It has one job: send visitors to the iOS and Android apps. It is
static HTML and CSS, kept apart from the Expo app, and builds without installing anything.

```bash
cd landing
npm run check      # builds dist/ and checks it (needs Node 18+, no npm install)
npx serve dist     # or: python3 -m http.server -d dist 8787
```

All copy and links are in the raw HTML. There is no client framework. One inline script moves Google Play first for
Android visitors, and the page reads the same without it.

## Where things live

| File | What |
| --- | --- |
| `site.config.json` | **The only place to edit** the canonical domain, contact email and store links |
| `src/content.mjs` | All copy: hero, how it works, features, FAQ. The page, JSON-LD and `llms.txt` are generated from it |
| `src/styles.css`, `src/platform.js` | Inlined into each page at build time, with CSP hashes computed by the build |
| `build.mjs` | Writes `dist/`: home page, `/privacy/`, `/terms/`, `/data-deletion/`, `/support/` (from `../legal/*.md`), `404.html`, `robots.txt`, `sitemap.xml`, `llms.txt`, `llms-full.txt` |
| `check.mjs` | Fails the build if the page and the FAQ JSON-LD drift apart, a store link doesn't match the config, a page has more than one `h1`, `robots.txt` stops allowing an AI crawler, a colour pair drops below WCAG AA contrast, or a category name (copy, hero screenshot or its alt text) no longer matches the app's `KIND_LABELS` |
| `public/` | Copied as-is: icons, OG image, hero screenshots, `_headers` |
| `og/og.html` | Source for `public/assets/og.png` (1200×630) |
| `og/home.html` | Source for the hero screenshots `public/assets/home-{light,dark}.webp` and `home-light.png` |

## When the store listings go live

Edit `site.config.json`, then rebuild and deploy:

```json
"appStore": { "url": "https://apps.apple.com/app/id<ID>", "appId": "<ID>" },
"googlePlay": { "url": "https://play.google.com/store/apps/details?id=ai.stashtag.app", "packageId": "ai.stashtag.app" }
```

- An empty `url` shows a "Coming soon to …" label that links nowhere. A filled-in `url` turns it into a download link
  and adds it to the JSON-LD (`downloadUrl`, `sameAs`) and `llms.txt`.
- `appStore.appId` turns on Safari's Smart App Banner (`<meta name="apple-itunes-app">`). Leave it empty until the
  app is live.
- The buttons are text, not Apple's or Google's badge artwork. Both companies only allow their badges once the app is
  listed. At launch, download the official badges (Apple Marketing Tools and Google Play's badge generator) into
  `public/assets/` and swap them into `storeButton()` in `build.mjs`. Keep the store name as the image's `alt`.

To change the domain, edit `siteUrl`. The canonical URL, Open Graph URLs, JSON-LD IDs, sitemap and robots `Sitemap:`
line all follow from it.

## Deploy

The output is just `dist/`. Every host serves it unchanged. Each page is `<slug>/index.html`, so URLs end in `/`.

**Cloudflare Pages:** create a project from this repo with root directory `landing`, build command `node build.mjs` and
output directory `dist`. To deploy from a laptop:

```bash
cd landing && node build.mjs && npx wrangler pages deploy dist --project-name stashtag-landing
```

Cloudflare applies `dist/_headers` (security headers, and a 1-week cache on `/assets/`) and serves `404.html` for
unknown paths.

**Vercel:** create a new project from this repo with root directory `landing`. `vercel.json` sets the build, output,
headers and trailing slashes. Keep it separate from the app.stashtag.ai project. From a laptop:

```bash
cd landing && npx vercel@latest deploy --prod
```

**S3 + CloudFront:** use the bucket's *static website hosting* endpoint as the CloudFront origin (it resolves
`/privacy/` to `/privacy/index.html`), with `404.html` as the error document. Upload with:

```bash
cd landing && node build.mjs
aws s3 sync dist s3://<bucket> --delete --exclude _headers --exclude "assets/*" --cache-control "public, max-age=0, must-revalidate"
aws s3 sync dist/assets s3://<bucket>/assets --delete --cache-control "public, max-age=604800, stale-while-revalidate=86400"
aws cloudfront create-invalidation --distribution-id <id> --paths "/*"
```

Add the `_headers` security headers as a CloudFront response headers policy.

The Content-Security-Policy is a `<meta>` tag in each page, so it works on every host. `_headers` and `vercel.json`
only add headers that are safe anywhere. `_headers` is also published as a plain file on Vercel and S3, which is
harmless.

## SEO and AI crawlers

- `robots.txt` allows everything and names GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot,
  Claude-User, PerplexityBot, Google-Extended, Applebot-Extended, CCBot and Bingbot explicitly.
- `llms.txt` is a plain-language summary (product, how it works, features, FAQ, store links). `llms-full.txt` adds the
  legal pages. The home page links to `llms.txt` with `<link rel="alternate">`.
- JSON-LD: `Organization`, `WebSite`, `MobileApplication` (iOS and Android, `LifestyleApplication`, price 0) and an
  `FAQPage` that matches the visible FAQ exactly.
- To re-render the OG image after a copy change:
  `npx playwright screenshot --viewport-size=1200,630 "file://$PWD/og/og.html" public/assets/og.png`
- When the app renames a category, update `categories` and `heroAlt` in `src/content.mjs`, add the old name to
  `retiredCategories`, edit `og/home.html`, and re-render the hero screenshots: open `og/home.html` in Playwright at
  295×640 with `deviceScaleFactor: 2`, once with `colorScheme: 'light'` and once with `'dark'`, and save as WebP
  (quality 82), plus a palette PNG of the light one as the `<img>` fallback.
