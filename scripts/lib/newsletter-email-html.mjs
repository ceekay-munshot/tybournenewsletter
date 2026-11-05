// Render the monthly intelligence edition as an inbox-safe HTML email body — the same
// content the dashboard's Newsletter tab and the PDF show (masthead, executive summary,
// an "everything that moved" table, per-dashboard commentary, watch list, sources), so
// the email is a full report on its own, not just a PDF attachment.
//
// Pure data in (consolidated.json + newsletter.json), HTML string out. Table-based
// layout, inline styles, web-safe fonts — no external CSS, flexbox or grid, so it renders
// in Gmail/Outlook/Apple Mail.

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const C = {
  ink: '#0f172a',
  body: '#334155',
  muted: '#64748b',
  faint: '#94a3b8',
  line: '#e2e8f0',
  panel: '#f8fafc',
  up: '#059669',
  down: '#e11d48',
  flat: '#64748b',
};

const dirColor = (d) => (d === 'up' ? C.up : d === 'down' ? C.down : C.flat);

/** Format a headline change exactly as the UI does (% | pp | pts). */
function formatChange(b) {
  if (b.changeDisplay === 'pp' || b.changeDisplay === 'pts') {
    if (b.changeAbs == null || !Number.isFinite(b.changeAbs)) return '—';
    const a = Math.abs(b.changeAbs);
    const dp = a >= 1 ? 1 : 2;
    return `${b.changeAbs > 0 ? '+' : ''}${b.changeAbs.toFixed(dp)} ${b.changeDisplay}`;
  }
  if (b.changePct == null || !Number.isFinite(b.changePct)) return '—';
  const v = b.changePct * 100;
  const r = v.toFixed(1);
  const n = parseFloat(r);
  if (n > 0) return `+${r}%`;
  if (n === 0) return `0.0%`;
  return `${r}%`;
}

/** Magnitude for ranking; narrative blocks (no numeric headline) sort last. */
function magnitude(b) {
  if (b.changeDisplay === 'pp' || b.changeDisplay === 'pts') return b.changeAbs != null ? Math.abs(b.changeAbs) : -1;
  return b.changePct != null ? Math.abs(b.changePct) : -1;
}

const sectionLabel = (text) =>
  `<p style="margin:28px 0 8px;font:700 12px Arial,Helvetica,sans-serif;letter-spacing:1px;text-transform:uppercase;color:${C.ink};border-bottom:1px solid ${C.line};padding-bottom:6px">${esc(text)}</p>`;

/**
 * @param {object} consolidated  clients/<client>/data/consolidated.json
 * @param {object} newsletter    clients/<client>/data/newsletter.json
 * @param {object} opts          { siteUrl }
 * @returns {string} HTML email body
 */
export function renderNewsletterEmailHtml(consolidated, newsletter, opts = {}) {
  const siteUrl = (opts.siteUrl || '').trim();
  const client = consolidated.client || { shortName: 'Tybourne', name: 'Tybourne Global Holdings', publishedBy: 'Munshot' };
  const sectors = new Map((consolidated.sectors || []).map((s) => [s.id, s]));
  const aiOk = newsletter && newsletter.status === 'ok';
  const editionLabel = (aiOk && newsletter.editionLabel) || 'Monthly intelligence edition';
  const lineFor = new Map(aiOk && Array.isArray(newsletter.lines) ? newsletter.lines.filter((l) => l && l.line).map((l) => [l.systemId, l.line]) : []);

  const fresh = (consolidated.systems || []).filter((b) => b.status !== 'error' && !b.isStale);
  const ranked = [...fresh].sort((a, b) => magnitude(b) - magnitude(a));

  // ── Masthead ──────────────────────────────────────────────────────────────
  const masthead =
    `<tr><td style="padding:28px 28px 0;text-align:center">` +
    `<div style="font:700 11px Arial,Helvetica,sans-serif;letter-spacing:2px;text-transform:uppercase;color:${C.faint}">Monthly intelligence edition</div>` +
    `<h1 style="margin:14px 0 0;font:700 30px Georgia,'Times New Roman',serif;letter-spacing:0.5px;text-transform:uppercase;color:${C.ink};border-top:2px solid ${C.ink};border-bottom:2px solid ${C.ink};padding:16px 0">${esc(client.shortName)} Intelligence</h1>` +
    `<div style="margin:12px 0 0;font:500 13px Arial,Helvetica,sans-serif;color:${C.muted}">${esc(editionLabel)}</div>` +
    `<div style="margin:6px 0 0;font:400 12px Arial,Helvetica,sans-serif;color:${C.faint}">Published by <span style="color:${C.body};font-weight:700">${esc(client.publishedBy)}</span> &nbsp;·&nbsp; <span style="color:${C.up};font-weight:700">100% real data, source-stamped</span></div>` +
    `</td></tr>`;

  // ── Executive summary ───────────────────────────────────────────────────────
  const execSummary = aiOk && newsletter.executiveSummary
    ? `<tr><td style="padding:0 28px">${sectionLabel('Executive summary')}` +
      `<p style="margin:0;font:400 15px/1.6 Georgia,'Times New Roman',serif;color:${C.body}">${esc(newsletter.executiveSummary)}</p></td></tr>`
    : '';

  // ── "Everything that moved" table ───────────────────────────────────────────
  const rows = ranked
    .map((b) => {
      const sector = sectors.get(b.sector);
      const change = formatChange(b);
      const col = change === '—' ? C.muted : dirColor(b.direction);
      const period = `${esc(b.lastPeriodLabel ?? '')} &rarr; ${esc(b.thisPeriodLabel ?? '')}`;
      return (
        `<tr>` +
        `<td style="padding:9px 12px;border-bottom:1px solid ${C.line};font:400 13px Arial,Helvetica,sans-serif;color:${C.ink}">` +
        `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${sector ? esc(sector.color) : C.faint};margin-right:7px"></span>` +
        `<strong>${esc(b.name)}</strong><br><span style="font-size:11px;color:${C.faint}">${esc(b.metricLabel ?? '')}</span></td>` +
        `<td style="padding:9px 12px;border-bottom:1px solid ${C.line};font:400 12px Arial,Helvetica,sans-serif;color:${C.muted};white-space:nowrap">${period}</td>` +
        `<td style="padding:9px 12px;border-bottom:1px solid ${C.line};font:700 15px Arial,Helvetica,sans-serif;color:${col};text-align:right;white-space:nowrap">${esc(change)}</td>` +
        `</tr>`
      );
    })
    .join('');
  const moversTable =
    `<tr><td style="padding:0 28px">${sectionLabel('Everything that moved')}` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${C.line};border-radius:8px;overflow:hidden">` +
    `<tr style="background:${C.panel}"><th align="left" style="padding:8px 12px;font:700 10px Arial,Helvetica,sans-serif;letter-spacing:0.5px;text-transform:uppercase;color:${C.faint}">Dashboard</th>` +
    `<th align="left" style="padding:8px 12px;font:700 10px Arial,Helvetica,sans-serif;letter-spacing:0.5px;text-transform:uppercase;color:${C.faint}">Period</th>` +
    `<th align="right" style="padding:8px 12px;font:700 10px Arial,Helvetica,sans-serif;letter-spacing:0.5px;text-transform:uppercase;color:${C.faint}">Change</th></tr>` +
    rows +
    `</table></td></tr>`;

  // ── Dashboard by dashboard (commentary) ─────────────────────────────────────
  const entries = ranked
    .map((b) => {
      const sector = sectors.get(b.sector);
      const accent = sector ? sector.color : C.faint;
      const change = formatChange(b);
      const col = change === '—' ? C.muted : dirColor(b.direction);
      const body = lineFor.get(b.systemId) || b.summary || '';
      return (
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 10px;border:1px solid ${C.line};border-left:3px solid ${esc(accent)};border-radius:8px">` +
        `<tr><td style="padding:12px 14px">` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
        `<td style="font:700 15px Arial,Helvetica,sans-serif;color:${C.ink}">${esc(b.name)}<br><span style="font:400 11px Arial,Helvetica,sans-serif;color:${C.faint}">${esc(b.metricLabel ?? '')} · ${esc(b.lastPeriodLabel ?? '')} &rarr; ${esc(b.thisPeriodLabel ?? '')}</span></td>` +
        `<td align="right" style="font:700 18px Arial,Helvetica,sans-serif;color:${col};white-space:nowrap;vertical-align:top">${esc(change)}</td>` +
        `</tr></table>` +
        (body ? `<p style="margin:9px 0 0;font:400 13px/1.55 Arial,Helvetica,sans-serif;color:${C.body}">${esc(body)}</p>` : '') +
        `</td></tr></table>`
      );
    })
    .join('');
  const bySystem = `<tr><td style="padding:0 28px">${sectionLabel('Dashboard by dashboard')}${entries}</td></tr>`;

  // ── Watch list ──────────────────────────────────────────────────────────────
  const watch = aiOk && Array.isArray(newsletter.watchList) && newsletter.watchList.length
    ? `<tr><td style="padding:0 28px">${sectionLabel('Watch list')}` +
      newsletter.watchList
        .map(
          (w, i) =>
            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px"><tr>` +
            `<td width="28" valign="top" style="font:700 13px Arial,Helvetica,sans-serif;color:#6366f1">${String(i + 1).padStart(2, '0')}</td>` +
            `<td style="font:400 13px/1.5 Arial,Helvetica,sans-serif;color:${C.body}">${esc(w)}</td></tr></table>`
        )
        .join('') +
      `</td></tr>`
    : '';

  // ── Sources ─────────────────────────────────────────────────────────────────
  const sourceNames = [...new Set((consolidated.systems || []).map((s) => s.sourceName).filter(Boolean))];
  const methodNote =
    (aiOk && newsletter.methodNote) ||
    'Every figure is pulled live from the sources below and stamped with both compared periods. Nothing is estimated, re-rounded, or filled in — a system with no clean data is marked, not guessed.';
  const sources =
    `<tr><td style="padding:0 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 0;background:${C.panel};border:1px solid ${C.line};border-radius:12px"><tr><td style="padding:16px 18px">` +
    `<div style="font:700 12px Arial,Helvetica,sans-serif;letter-spacing:0.5px;text-transform:uppercase;color:${C.ink}">Sources · nothing fabricated</div>` +
    `<p style="margin:8px 0 0;font:400 12px/1.6 Arial,Helvetica,sans-serif;color:${C.muted}">${esc(methodNote)}</p>` +
    (sourceNames.length ? `<p style="margin:8px 0 0;font:400 11px/1.6 Arial,Helvetica,sans-serif;color:${C.faint}"><strong style="color:${C.muted}">Sources:</strong> ${esc(sourceNames.join(' · '))}</p>` : '') +
    `</td></tr></table></td></tr>`;

  // ── Footer (dashboard link + PDF note) ──────────────────────────────────────
  const footer =
    `<tr><td style="padding:22px 28px 28px;text-align:center">` +
    (siteUrl
      ? `<a href="${esc(siteUrl)}" style="display:inline-block;background:${C.ink};color:#ffffff;text-decoration:none;font:700 13px Arial,Helvetica,sans-serif;padding:11px 20px;border-radius:8px">Open the live dashboard</a>`
      : '') +
    `<p style="margin:14px 0 0;font:400 12px Arial,Helvetica,sans-serif;color:${C.faint}">${opts.pdfAttached ? 'The full edition is also attached as a PDF.' : 'The full edition is also on the live dashboard.'} &nbsp;·&nbsp; Published by ${esc(client.publishedBy)}.</p>` +
    `</td></tr>`;

  return (
    `<div style="margin:0;padding:0;background:#f1f5f9">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9"><tr><td align="center" style="padding:20px 10px">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${C.line}">` +
    masthead +
    execSummary +
    moversTable +
    bySystem +
    watch +
    sources +
    footer +
    `</table></td></tr></table></div>`
  );
}
