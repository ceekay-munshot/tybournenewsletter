// Render the in-app Newsletter edition to a PDF with Playwright/Chromium.
//
// By default it serves the freshly-built ./dist locally and renders the
// `/?edition=newsletter` deep-link, so the PDF always matches the data just
// generated. Set SITE_URL to render the DEPLOYED route instead
// (e.g. SITE_URL=https://tybournenewsletter.pages.dev).
//
// Output: $NEWSLETTER_PDF (default ./tybourne-intelligence.pdf).
// Usage: node scripts/render-newsletter-pdf.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(ROOT, 'dist');
const OUT = process.env.NEWSLETTER_PDF || resolve(ROOT, 'tybourne-intelligence.pdf');
const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');
const PORT = Number(process.env.RENDER_PORT || 4319);

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json',
};

async function loadChromium() {
  // CI: playwright is installed into node_modules. Local dev box: the pre-installed copy.
  try {
    const pw = await import('playwright');
    return (pw.default ?? pw).chromium;
  } catch {
    const pw = await import('/opt/node-tools/node_modules/playwright/index.js');
    return (pw.default ?? pw).chromium;
  }
}

function serveDist(dir, port) {
  const server = createServer(async (req, res) => {
    try {
      const p = decodeURIComponent((req.url || '/').split('?')[0]);
      let fp = normalize(join(dir, p));
      if (!fp.startsWith(dir)) {
        res.writeHead(403);
        return res.end();
      }
      if (p === '/' || !extname(fp) || !existsSync(fp)) fp = join(dir, 'index.html'); // SPA fallback
      const body = await readFile(fp);
      res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((ok) => server.listen(port, () => ok(server)));
}

async function run() {
  let server = null;
  let url;
  if (SITE_URL) {
    url = `${SITE_URL}/?edition=newsletter`;
    console.log(`Rendering deployed newsletter: ${url}`);
  } else {
    if (!existsSync(join(DIST, 'index.html'))) {
      throw new Error('dist/ not found — run `npm run build` first (or set SITE_URL to render the deployed site).');
    }
    server = await serveDist(DIST, PORT);
    url = `http://localhost:${PORT}/?edition=newsletter`;
    console.log(`Serving ./dist and rendering: ${url}`);
  }

  const chromium = await loadChromium();
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1600 }, deviceScaleFactor: 2 });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('.nl-root', { timeout: 30000 });
    await page.waitForTimeout(1200); // let charts finish their entrance animation
    await page.pdf({
      path: OUT,
      format: 'A4',
      printBackground: true,
      margin: { top: '13mm', bottom: '13mm', left: '12mm', right: '12mm' },
    });
    console.log(`Newsletter PDF written: ${OUT}`);
  } finally {
    await browser.close();
    if (server) server.close();
  }
}

run().catch((e) => {
  console.error('render-newsletter-pdf failed:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
