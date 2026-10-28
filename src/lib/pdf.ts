// One-click "Download PDF" for the newsletter.
//
// Snapshots the rendered edition exactly as it looks on screen (fonts, colours, charts,
// column widths) and files it straight into an A4 PDF — no print dialog, no print-stylesheet
// reflow. Steps: copy the article's markup plus the page's own CSS into an SVG
// <foreignObject> (the browser lays it out again, identically), cut it into A4 pages at
// clean break points (never through a table row, card, paragraph or heading), raster each
// page at 2x, and write a small PDF by hand. Loaded on demand; no dependencies.

/** CSS px -> device px. 2x keeps text crisp on paper and on a retina zoom. */
const SCALE = 2;
const JPEG_QUALITY = 0.85;
/** The article's width on a desktop screen. Narrower screens (phone, split window) are laid
 *  out at this width for the PDF, so the page never comes out as a stretched phone column. */
const MIN_WIDTH = 832;

// A4 in PDF points, with editorial margins (~10mm sides, ~11mm top; the footer sits in the bottom margin).
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 28;
const MARGIN_TOP = 30;
const MARGIN_BOTTOM = 36;

// Page-break rules. A break never cuts through a row, paragraph, heading, chart or card
// (UNBREAKABLE). A dashboard entry or table (SPLITTABLE) is moved whole to the next page
// when that keeps the page at least FULL_ENOUGH; otherwise it may split between rows, but
// never inside its first HEAD_PX (title, header row, first rows) or last TAIL_PX.
const UNBREAKABLE = '.nl-avoid,.nl-masthead,tr,p,li,h1,h2,h3,svg';
const SPLITTABLE = '.nl-entry,.nl-entry > *,.nl-table,table';
/** Headings and header rows pull this much of what follows onto their page. */
const KEEP_WITH_NEXT = 'h1,h2,h3,thead';
const KEEP_WITH_NEXT_PX = 70;
const HEAD_PX = 110;
const TAIL_PX = 50;
const FULL_ENOUGH = 0.7;
/** A page always carries at least this much before a break is considered. */
const MIN_FILL = 0.4;

export interface PdfMeta {
  title: string;
  /** Left side of every page footer, e.g. "Tybourne Intelligence · 28 Oct 2026". */
  footer: string;
}

// ---------------------------------------------------------------------------
// Fonts — Google Fonts' stylesheet is cross-origin, so its rules can't be read from
// document.styleSheets. Fetch it once, keep the latin faces, inline them as data URLs.

let fontCss: Promise<string> | null = null;

const toDataUrl = (blob: Blob) =>
  new Promise<string>((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => fail(r.error);
    r.readAsDataURL(blob);
  });

async function loadFontCss(): Promise<string> {
  const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href*="fonts.googleapis.com"]')];
  const sheets = await Promise.all(links.map((l) => fetch(l.href).then((r) => (r.ok ? r.text() : ''))));
  // Google labels each face with its subset: /* latin */ @font-face { ... }
  const faces = sheets
    .join('\n')
    .split(/(?=\/\*\s*[\w-]+\s*\*\/)/)
    .filter((chunk) => /^\/\*\s*latin(-ext)?\s*\*\//.test(chunk))
    .map((chunk) => chunk.replace(/^\/\*.*?\*\//, '').trim());
  const urls = [...new Set(faces.flatMap((f) => [...f.matchAll(/url\((['"]?)([^'")]+)\1\)/g)].map((m) => m[2])))];
  const inlined = new Map<string, string>();
  await Promise.all(
    urls.map(async (u) => {
      const res = await fetch(u);
      if (res.ok) inlined.set(u, await toDataUrl(await res.blob()));
    })
  );
  return faces
    .map((f) => f.replace(/url\((['"]?)([^'")]+)\1\)/g, (all, _q, u: string) => (inlined.has(u) ? `url(${inlined.get(u)})` : all)))
    .join('\n');
}

/** Start fetching fonts ahead of the click (called when the newsletter opens). */
export function prewarmPdf(): void {
  fontCss ??= loadFontCss().catch(() => '');
}

// ---------------------------------------------------------------------------
// The page's CSS, resolved for the current screen: @media blocks that match right now are
// unwrapped and the rest dropped, so the snapshot uses exactly the breakpoints on screen
// (inside an SVG image, media queries would otherwise see the image's size instead).
// Rules for html and body move onto two wrappers that stand in for them — that is where the
// article inherits its font, colour and relative line-height from (body's
// `line-height: inherit` needs html's 1.5 above it).

const PAGE_ROOT: Record<string, string> = { html: '[data-pdf-html]', ':host': '[data-pdf-html]', body: '[data-pdf-body]' };

function screenCss(): string {
  const out: string[] = [];
  const walk = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSMediaRule) {
        if (window.matchMedia(rule.media.mediaText).matches) walk(rule.cssRules);
      } else if (rule instanceof CSSStyleRule && rule.selectorText.split(',').every((sel) => sel.trim() in PAGE_ROOT)) {
        const sels = rule.selectorText.split(',').map((sel) => PAGE_ROOT[sel.trim()]);
        out.push(`${[...new Set(sels)].join(',')}{${rule.style.cssText}}`);
      } else if (!(rule instanceof CSSKeyframesRule) && !(rule instanceof CSSFontFaceRule)) {
        out.push(rule.cssText);
      }
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      walk(sheet.cssRules);
    } catch {
      /* cross-origin sheet (Google Fonts) — its faces come from loadFontCss() */
    }
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Page breaks

/** Cut points (CSS px from the article top) so each page holds at most `pageH`. */
export function pageBreaks(root: HTMLElement, pageH: number): number[] {
  const top0 = root.getBoundingClientRect().top;
  const total = root.scrollHeight;
  const hard: Array<[number, number]> = []; // never cut inside
  const soft: Array<[number, number]> = []; // cut inside only to avoid a mostly-empty page
  const edges = new Set<number>();
  const box = (el: Element) => {
    const r = el.getBoundingClientRect();
    return [r.top - top0, r.bottom - top0, r.height] as const;
  };
  for (const el of root.querySelectorAll(UNBREAKABLE)) {
    const [t, b, h] = box(el);
    if (!h) continue;
    edges.add(Math.round(t)).add(Math.round(b));
    const end = b + (el.matches(KEEP_WITH_NEXT) ? KEEP_WITH_NEXT_PX : 0);
    if (end - t < pageH * 0.92) hard.push([t, end]);
  }
  for (const el of root.querySelectorAll(SPLITTABLE)) {
    const [t, b, h] = box(el);
    if (!h) continue;
    edges.add(Math.round(t)).add(Math.round(b));
    const end = b + (el.matches(KEEP_WITH_NEXT) ? KEEP_WITH_NEXT_PX : 0);
    if (end - t < pageH * 0.92) soft.push([t, end]);
    hard.push([t, t + Math.min(HEAD_PX, h)], [b - Math.min(TAIL_PX, h), b]);
  }
  const candidates = [...edges].sort((a, b) => b - a);
  const inside = (y: number, spans: Array<[number, number]>) => spans.some(([t, b]) => t < y - 0.5 && y + 0.5 < b);
  const latest = (y0: number, limit: number, strict: boolean) =>
    candidates.find((c) => c <= limit && c > y0 + pageH * MIN_FILL && !inside(c, hard) && !(strict && inside(c, soft)));

  const cuts: number[] = [];
  let y0 = 0;
  while (total - y0 > pageH) {
    const limit = y0 + pageH;
    const whole = latest(y0, limit, true);
    const y = whole != null && whole - y0 >= pageH * FULL_ENOUGH ? whole : latest(y0, limit, false) ?? whole ?? limit;
    cuts.push(y);
    y0 = y;
  }
  return cuts;
}

// ---------------------------------------------------------------------------
// Snapshot -> pages

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.decoding = 'sync';
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error('Could not render the newsletter snapshot.'));
    img.src = src;
  });
}

const canvasToJpeg = (c: HTMLCanvasElement) =>
  new Promise<Uint8Array>((ok, fail) =>
    c.toBlob(
      (b) => (b ? b.arrayBuffer().then((buf) => ok(new Uint8Array(buf)), fail) : fail(new Error('Canvas export failed.'))),
      'image/jpeg',
      JPEG_QUALITY
    )
  );

interface PageImage {
  jpeg: Uint8Array;
  w: number; // device px
  h: number;
}

/** Styles for the copy, scoped so they never touch the live page: animations frozen at rest
 *  (inside the image they would replay from frame 0) and no scrollbars. */
const COPY_CSS =
  '[data-pdf-copy],[data-pdf-copy] *,[data-pdf-copy] *::before,[data-pdf-copy] *::after' +
  '{animation:none!important;transition:none!important;scrollbar-width:none}' +
  '[data-pdf-copy] ::-webkit-scrollbar{display:none}';

/** Lay a copy of the article out off-screen at its on-screen width (at least MIN_WIDTH), so
 *  page breaks are measured on exactly what gets rendered. Screen-only bits (download/close
 *  buttons, the "AI off" note) are dropped, and a table that scrolls sideways on screen is
 *  zoomed to fit — paper can't scroll, and no column may be lost. */
function mountCopy(root: HTMLElement): { host: HTMLElement; copy: HTMLElement } {
  const copy = root.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.no-print').forEach((n) => n.remove());
  const host = document.createElement('div');
  host.setAttribute('data-pdf-copy', '');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:absolute;left:-100000px;top:0;width:${Math.max(root.offsetWidth, MIN_WIDTH)}px;background:#fff;pointer-events:none`;
  const style = document.createElement('style');
  style.textContent = COPY_CSS;
  host.append(style, copy);
  document.body.append(host);
  for (const box of copy.querySelectorAll<HTMLElement>('.overflow-x-auto')) {
    const inner = box.firstElementChild;
    if (inner instanceof HTMLElement && box.scrollWidth > box.clientWidth + 1) {
      inner.style.zoom = String(box.clientWidth / box.scrollWidth);
    }
  }
  return { host, copy };
}

/** The laid-out copy as a self-contained SVG image (data: URL — Chrome taints canvases
 *  drawn from foreignObject SVGs loaded any other way). */
async function copySvg(copy: HTMLElement, w: number, h: number): Promise<string> {
  prewarmPdf();
  const css = `${await fontCss}\n${screenCss()}\n${COPY_CSS}`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w * SCALE}" height="${h * SCALE}" viewBox="0 0 ${w} ${h}">` +
    `<foreignObject x="0" y="0" width="${w}" height="${h}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" data-pdf-html="" style="width:${w}px">` +
    `<style><![CDATA[${css}]]></style>` +
    `<div data-pdf-body="" data-pdf-copy="" style="margin:0;background:#fff">` +
    new XMLSerializer().serializeToString(copy) +
    '</div></div></foreignObject></svg>';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function snapshotPages(root: HTMLElement): Promise<PageImage[]> {
  const { host, copy } = mountCopy(root);
  let img: HTMLImageElement;
  let cuts: number[];
  const cssW = copy.offsetWidth;
  const cssH = copy.scrollHeight;
  try {
    const ptPerPx = (PAGE_W - 2 * MARGIN_X) / cssW;
    cuts = pageBreaks(copy, Math.floor((PAGE_H - MARGIN_TOP - MARGIN_BOTTOM) / ptPerPx));
    img = await loadImage(await copySvg(copy, cssW, cssH));
  } finally {
    host.remove();
  }
  // Safari decodes fonts inside an SVG image lazily: one throwaway draw, then a beat.
  const warm = document.createElement('canvas');
  warm.width = warm.height = 8;
  warm.getContext('2d')?.drawImage(img, 0, 0, 8, 8);
  await new Promise((r) => setTimeout(r, 30));

  const bounds = [0, ...cuts, cssH];
  const w = Math.round(cssW * SCALE);
  const pages: PageImage[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const y = bounds[i] * SCALE;
    const h = Math.max(1, Math.round((bounds[i + 1] - bounds[i]) * SCALE));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available in this browser.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, y, w, h, 0, 0, w, h);
    pages.push({ jpeg: await canvasToJpeg(c), w, h });
  }
  return pages;
}

// ---------------------------------------------------------------------------
// Minimal PDF writer: one JPEG per A4 page plus a vector footer (Helvetica).

const enc = new TextEncoder();
const n2 = (v: number) => (Math.round(v * 100) / 100).toString();

/** PDF literal string in WinAnsi (latin-1 is a safe subset); anything else becomes '-'. */
function pdfString(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    const b = c < 32 || c > 255 ? 45 : c;
    out += b === 40 || b === 41 || b === 92 ? `\\${String.fromCharCode(b)}` : b > 126 ? `\\${b.toString(8).padStart(3, '0')}` : String.fromCharCode(b);
  }
  return `(${out})`;
}

/** Document title as UTF-16BE hex (keeps em dashes etc. in the reader's title bar). */
function pdfTextHex(s: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

// Helvetica advance widths (per 1000 em) for the right-aligned page counter; the rest are 556.
const HELV: Record<string, number> = { ' ': 278, P: 667, f: 278 };
const helvWidth = (s: string, size: number) => [...s].reduce((w, ch) => w + (HELV[ch] ?? 556), 0) * (size / 1000);

function writePdf(pages: PageImage[], meta: PdfMeta): Blob {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? enc.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const obj = (id: number, body: string | Array<string | Uint8Array>) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    for (const p of Array.isArray(body) ? body : [body]) push(p);
    push('\nendobj\n');
  };

  // Objects: 1 catalog, 2 page tree, 3 font, 4 info, then 3 per page (page, content, image).
  const pageId = (i: number) => 5 + i * 3;
  push('%PDF-1.4\n%âãÏÓ\n'); // binary marker: non-ASCII bytes in a comment
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] >>`);
  obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  obj(4, `<< /Title ${pdfTextHex(meta.title)} /Producer (Munshot) /CreationDate (D:${stamp}Z) >>`);

  const contentW = PAGE_W - 2 * MARGIN_X;
  const ink = '0.58 0.639 0.722'; // slate-400
  pages.forEach((p, i) => {
    const id = pageId(i);
    const drawH = (p.h / p.w) * contentW;
    const counter = `Page ${i + 1} of ${pages.length}`;
    const fy = 18;
    const content =
      `q ${n2(contentW)} 0 0 ${n2(drawH)} ${n2(MARGIN_X)} ${n2(PAGE_H - MARGIN_TOP - drawH)} cm /Im0 Do Q\n` +
      `q 0.886 0.91 0.941 RG 0.5 w ${n2(MARGIN_X)} ${fy + 10} m ${n2(PAGE_W - MARGIN_X)} ${fy + 10} l S Q\n` +
      `BT /F1 7 Tf ${ink} rg ${n2(MARGIN_X)} ${fy} Td ${pdfString(meta.footer)} Tj ET\n` +
      `BT /F1 7 Tf ${ink} rg ${n2(PAGE_W - MARGIN_X - helvWidth(counter, 7))} ${fy} Td ${pdfString(counter)} Tj ET`;
    obj(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /XObject << /Im0 ${id + 2} 0 R >> /Font << /F1 3 0 R >> >> /Contents ${id + 1} 0 R >>`
    );
    obj(id + 1, [`<< /Length ${enc.encode(content).length} >>\nstream\n`, content, '\nendstream']);
    obj(id + 2, [
      `<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB ` +
        `/BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
      p.jpeg,
      '\nendstream',
    ]);
  });

  const size = pageId(pages.length);
  const xrefAt = length;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let id = 1; id < size; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${size} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}

// ---------------------------------------------------------------------------

/** Build the PDF for a rendered newsletter article. */
export async function buildNewsletterPdf(root: HTMLElement, meta: PdfMeta): Promise<Blob> {
  return writePdf(await snapshotPages(root), meta);
}

/** Build and hand the browser a file download. */
export async function downloadNewsletterPdf(root: HTMLElement, meta: PdfMeta, filename: string): Promise<void> {
  const blob = await buildNewsletterPdf(root, meta);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
