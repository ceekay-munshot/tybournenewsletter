// Hugging Face Activity — new AI Spaces created on the Hub, Weekly and MoM.
// The Hub's own insights.json is the authoritative, self-consistent source: each
// period (week / month) ships `facts` carrying value, prev and changePct, so the
// headline, the use-case breakdown and the model-family shifts all come straight
// from the Hub's published numbers. History starts late-July 2026, so a QoQ needs
// two full quarters we don't have yet — shown honestly as unavailable.
import { getJson } from '../lib/http.mjs';
import { monthLabel } from '../lib/quarters.mjs';
import { makeBlock, directionOf, attachPrev } from '../lib/changeBlock.mjs';

const UC_LABEL = {
  '3d-gaming': '3D / gaming',
  'chat-assistant': 'Chat & assistants',
  coding: 'Coding',
  'data-analysis': 'Data analysis',
  'document-ai': 'Document AI',
  education: 'Education',
  'image-generation': 'Image generation',
  'music-generation': 'Music generation',
  other: 'Other / mixed',
  robotics: 'Robotics',
  'scientific-tools': 'Scientific tools',
  'search-research': 'Search & research',
  'video-generation': 'Video generation',
  'voice-audio': 'Voice & audio',
};
const FAMILY_LABEL = {
  'glm-zhipu': 'GLM (Zhipu)',
  'kimi-moonshot': 'Kimi (Moonshot)',
  'nvidia-nemotron': 'Nvidia Nemotron',
  'other-open': 'Other open models',
  unknown: 'Unresolved family',
};
const famLabel = (d) => FAMILY_LABEL[d] || d.charAt(0).toUpperCase() + d.slice(1);

const frac = (changePct) => (changePct == null || !Number.isFinite(changePct) ? null : changePct / 100);

// Robust-z over a set of fractional changes → flags the use-cases diverging from the pack.
function zScorer(values) {
  const xs = values.filter((v) => v != null && Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (xs.length < 3) return () => 0;
  const med = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
  const dev = xs.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  const mad = dev.length % 2 ? dev[(dev.length - 1) / 2] : (dev[dev.length / 2 - 1] + dev[dev.length / 2]) / 2;
  const scale = 1.4826 * mad;
  return (v) => (v == null || !scale ? 0 : (v - med) / scale);
}

const factBy = (entry, pred) => (entry?.facts || []).find(pred);
const spacesTotalFact = (entry) =>
  factBy(entry, (f) => f.cut === 'sdk_distribution' && f.dimension == null) ||
  factBy(entry, (f) => String(f.what || '').toLowerCase().includes('new spaces in total'));

function viewFrom(entry, comparison, label, labelOf, prevLabelOf) {
  if (!entry) return unavailable(comparison, label, 'No data for this window yet.');
  const total = spacesTotalFact(entry);
  if (!total || total.value == null) return unavailable(comparison, label, 'No data for this window yet.');

  const uc = (entry.facts || []).filter((f) => f.cut === 'spaces_by_use_case' && f.dimension);
  const zOf = zScorer(uc.map((f) => frac(f.changePct)));
  const rows = uc
    .map((f) => {
      const cp = frac(f.changePct);
      return {
        label: UC_LABEL[f.dimension] || f.dimension,
        thisValue: f.value ?? null,
        lastValue: f.prev ?? null,
        changePct: cp,
        direction: directionOf(cp),
        bigMove: cp != null && Math.abs(zOf(cp)) >= 1.5,
      };
    })
    .sort((a, b) => (b.thisValue ?? 0) - (a.thisValue ?? 0));

  const cp = frac(total.changePct);
  const top = rows.filter((r) => r.label !== 'Other / mixed')[0];
  const summary =
    cp != null
      ? `${cap(label)}-on-${label.toLowerCase()} new Spaces ${cp >= 0 ? 'up' : 'down'} ${Math.abs(cp * 100).toFixed(
          1
        )}% to ${fmtInt(total.value)}${top ? `; ${top.label.toLowerCase()} leads the build mix at ${fmtInt(top.thisValue)} new Spaces` : ''}.`
      : undefined;

  return {
    comparison,
    label,
    available: cp != null,
    thisPeriodLabel: labelOf(entry.periodKey),
    lastPeriodLabel: prevLabelOf ? prevLabelOf(entry.periodKey) : '',
    thisValue: total.value ?? null,
    lastValue: total.prev ?? null,
    changePct: cp,
    direction: directionOf(cp),
    bigMove: cp != null && Math.abs(cp) >= 0.5,
    breakdown: rows,
    summary,
  };
}

function unavailable(comparison, label, reason) {
  return {
    comparison,
    label,
    available: false,
    unavailableReason: reason,
    thisPeriodLabel: '—',
    lastPeriodLabel: '—',
    thisValue: null,
    lastValue: null,
    changePct: null,
    changeAbs: null,
    direction: 'flat',
    breakdown: [],
  };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtInt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('en-US'));

// WoW periodKey is a week-start date "2026-10-05"; MoM is "2026-09".
const M3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const weekLabel = (k) => {
  const d = new Date(`${k}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return k;
  return `wk ${d.getUTCDate()} ${M3[d.getUTCMonth()]}`;
};
const prevWeekLabel = (k) => {
  const d = new Date(`${k}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() - 7);
  return `wk ${d.getUTCDate()} ${M3[d.getUTCMonth()]}`;
};
const prevMonthLabel = (ym) => {
  const [y, m] = String(ym).split('-').map(Number);
  if (!y || !m) return '';
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${M3[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`;
};

function buildInsights(month) {
  if (!month) return [];
  const out = [];
  const models = factBy(month, (f) => f.cut === 'models_by_family' && f.dimension == null);

  // 1) the month in one line (lifted narrative) + the models headline
  if (month.narrative) {
    out.push({
      title: 'The month in one line',
      body:
        month.narrative.trim() +
        (models && models.value != null
          ? ` New models totalled ${fmtInt(models.value)}${
              models.changePct != null ? ` (${models.changePct >= 0 ? '+' : ''}${models.changePct.toFixed(0)}% MoM)` : ''
            }.`
          : ''),
      asOf: month.generatedAt,
    });
  }

  // 2) model-family shifts — the divergent story inside "new models"
  const fams = (month.facts || [])
    .filter((f) => f.cut === 'models_by_family' && f.dimension && f.dimension !== 'unknown' && f.changePct != null)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 5);
  if (fams.length) {
    out.push({
      title: 'Model-family shifts (new models, MoM)',
      body: 'Which model families saw the most new models published this month.',
      bullets: fams.map(
        (f) => `${famLabel(f.dimension)} ${f.changePct >= 0 ? '+' : ''}${f.changePct.toFixed(0)}% (${fmtInt(f.value)} new)`
      ),
      asOf: month.generatedAt,
    });
  }

  // 3) honest read on the MoM base
  out.push({
    title: 'Reading the month-on-month jump',
    body:
      'August 2026 was Hugging Face’s first full tracked month, so the comparison base is young. The Weekly view — new Spaces running a steady ~6.4k/week — is the cleaner read on the current pace; treat the large MoM as base-sensitive.',
  });
  return out;
}

export async function connect(system) {
  const ins = await getJson(system.source.insights);
  const months = Array.isArray(ins?.month) ? ins.month : [];
  const weeks = Array.isArray(ins?.week) ? ins.week : [];
  if (!months.length) throw new Error('HF insights.json has no monthly entries');

  const month0 = months[0];
  const week0 = weeks[0];

  const momView = viewFrom(month0, 'MoM', 'Month', monthLabel, prevMonthLabel);
  const wowView = week0
    ? viewFrom(week0, 'WoW', 'Week', weekLabel, prevWeekLabel)
    : unavailable('WoW', 'Week', 'No weekly entry yet.');

  // one period further back (months[1] / weeks[1]), so the headline + table show two
  // consecutive periods of trend. Left unset when that prior entry isn't a valid comparison.
  if (momView.available && months[1]) {
    const momPrior = viewFrom(months[1], 'MoM', 'Month', monthLabel, prevMonthLabel);
    if (momPrior.available) {
      attachPrev(momView.breakdown, momPrior.breakdown);
      momView.prevLabel = momPrior.lastPeriodLabel; // the period before lastPeriodLabel
      momView.prevValue = momPrior.lastValue; // the period before last (oldest total)
      momView.prevChangePct = momPrior.changePct;
      momView.prevDirection = momPrior.direction;
    }
  }
  if (wowView.available && weeks[1]) {
    const wowPrior = viewFrom(weeks[1], 'WoW', 'Week', weekLabel, prevWeekLabel);
    if (wowPrior.available) {
      attachPrev(wowView.breakdown, wowPrior.breakdown);
      wowView.prevLabel = wowPrior.lastPeriodLabel; // the period before lastPeriodLabel
      wowView.prevValue = wowPrior.lastValue;
      wowView.prevChangePct = wowPrior.changePct;
      wowView.prevDirection = wowPrior.direction;
    }
  }
  const qoqView = unavailable(
    'QoQ',
    'Quarter',
    'Hugging Face tracking started in late July 2026 — a quarter-on-quarter needs two full quarters, so it is not available yet.'
  );
  const views = [wowView, momView, qoqView];
  const def = momView.available ? momView : wowView.available ? wowView : views[0];

  const asOf = month0.generatedAt || `${month0.periodKey}-28`;
  const block = makeBlock(system, {
    unit: 'new Spaces',
    comparison: def.comparison,
    thisPeriodLabel: def.thisPeriodLabel,
    lastPeriodLabel: def.lastPeriodLabel,
    thisValue: def.thisValue,
    lastValue: def.lastValue,
    changePct: def.changePct,
    direction: def.direction,
    asOf,
    breakdown: def.breakdown,
    summary: def.summary,
    notes:
      'New AI Spaces published on the Hugging Face Hub, from the Hub’s own insights feed (authoritative value/prev per period). Breakdown is new Spaces by use-case; model-family shifts and the new-models total are in “Why it moved”. Quarter-on-quarter needs two full quarters — not available yet.',
  });
  block.views = views;
  block.breakdownNoun = 'use-case';
  block.changeNoun = 'New Spaces change';
  block.insights = buildInsights(month0);
  return block;
}
