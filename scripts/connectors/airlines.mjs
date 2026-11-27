// Airline Demand — US passenger throughput (TSA checkpoint counts), on a YEAR-ON-YEAR
// basis so the seasonal summer-peak / winter-trough swing doesn't masquerade as a trend.
// Toggle is granularity: latest week / month / quarter, each vs the same period a year
// earlier. TSA is current (daily, ~1-day lag). The breakdown is global demand by world
// region (IATA RPK, year-on-year) — IATA publishes on a ~2-month lag, so those figures
// are the latest available (not frozen); that lag is stamped explicitly.
import { readFeed } from '../lib/private-feeds.mjs';
import { getJson } from '../lib/http.mjs';
import { quarterOf, quarterLabel, monthLabel } from '../lib/quarters.mjs';
import { makeBlock, directionOf, pctChange } from '../lib/changeBlock.mjs';

const DAY = 86400000;
const BIG = 0.03; // a >=3% YoY move in passenger demand is notable

const meanOf = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function yoyView(byDate, dates, comparison, label, thisLabel, lastLabel) {
  // this-period mean vs the same calendar dates one year earlier (364 days back keeps the weekday).
  const thisVals = dates.map((d) => byDate.get(d)).filter((v) => v != null);
  const agoVals = dates
    .map((d) => {
      const t = new Date(`${d}T00:00:00Z`).getTime() - 364 * DAY;
      return byDate.get(new Date(t).toISOString().slice(0, 10));
    })
    .filter((v) => v != null);
  const tMean = meanOf(thisVals);
  const lMean = agoVals.length >= Math.max(3, dates.length * 0.5) ? meanOf(agoVals) : null;
  const yoy = pctChange(tMean, lMean);
  return {
    comparison,
    label,
    available: yoy != null,
    unavailableReason: yoy == null ? 'No year-ago data to compare against yet.' : undefined,
    thisPeriodLabel: thisLabel,
    lastPeriodLabel: lastLabel,
    thisValue: tMean != null ? Math.round(tMean) : null,
    lastValue: lMean != null ? Math.round(lMean) : null,
    changePct: yoy,
    direction: directionOf(yoy),
    bigMove: yoy != null && Math.abs(yoy) >= BIG,
    _dates: dates,
    _tMean: tMean,
  };
}

const monthsBack = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

// Month / quarter views show the CURRENT period to date (MTD / QTD) once it has enough days
// to be meaningful; before that (e.g. 2 Dec) the last full period is the honest read.
const MIN_MTD_DAYS = 7;
const MIN_QTD_DAYS = 28;

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayMon = (iso) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`;
const dayMonYr = (iso) => `${dayMon(iso)} '${iso.slice(2, 4)}`;
const shiftDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const isMonthEnd = (iso) => shiftDays(iso, 1).slice(8, 10) === '01';
/** "1–23 Nov '26" (same month) or "1 Oct – 23 Nov '26" / "29 Dec '25 – 4 Jan '26". */
function span(first, last) {
  if (first === last) return dayMonYr(first);
  if (first.slice(0, 7) === last.slice(0, 7)) return `${Number(first.slice(8, 10))}–${dayMonYr(last)}`;
  if (first.slice(0, 4) === last.slice(0, 4)) return `${dayMon(first)} – ${dayMonYr(last)}`;
  return `${dayMonYr(first)} – ${dayMonYr(last)}`;
}
/** "(1–23 Nov '26 vs the same weekdays a year earlier, 2–24 Nov '25)" for a view's dates. */
function windowPhrase(dates) {
  const a = dates[0];
  const b = dates[dates.length - 1];
  return `${span(a, b)} vs the same weekdays a year earlier, ${span(shiftDays(a, -364), shiftDays(b, -364))}`;
}

const unavailable = (comparison, label, reason) => ({
  comparison,
  label,
  available: false,
  unavailableReason: reason,
  breakdown: [],
  thisPeriodLabel: '—',
  lastPeriodLabel: '—',
  thisValue: null,
  lastValue: null,
  changePct: null,
  direction: 'flat',
});

export async function connect(system) {
  const { repository, base } = system.source;
  const read = (name) => repository ? readFeed(repository, `data/${name}.json`) : getJson(`${base}/${name}.json`);
  const tsa = await read('tsa');
  const realSet = new Set(tsa?._meta?.real_days || []);
  const days = (tsa?.days || []).filter(
    (d) => d && d.throughput != null && (realSet.size ? realSet.has(d.date) : true)
  );
  if (days.length < 400) throw new Error('insufficient TSA history');
  days.sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map(days.map((d) => [d.date, d.throughput]));
  const latest = days[days.length - 1].date;

  // group dates by month / quarter
  const monthDates = {};
  const quarterDates = {};
  for (const d of days) {
    (monthDates[d.date.slice(0, 7)] ??= []).push(d.date);
    (quarterDates[quarterOf(d.date)] ??= []).push(d.date);
  }
  const curMonth = latest.slice(0, 7);
  const curQuarter = quarterOf(latest);
  const curMonthDone = isMonthEnd(latest);
  const curQuarterDone = curMonthDone && [3, 6, 9, 12].includes(Number(latest.slice(5, 7)));
  // "complete" = enough days AND the period has actually ended (the current one only on its last day)
  const completeMonths = Object.keys(monthDates)
    .filter((m) => monthDates[m].length >= 27 && (m < curMonth || curMonthDone))
    .sort();
  const completeQuarters = Object.keys(quarterDates)
    .filter((q) => quarterDates[q].length >= 85 && (q < curQuarter || curQuarterDone))
    .sort();

  const yrAgoQuarter = (q) => `${Number(q.slice(0, 4)) - 1}-${q.slice(5)}`;
  const fullMonth = (m) => yoyView(byDate, monthDates[m], 'MoM', 'Month', monthLabel(m), monthLabel(monthsBack(m, 12)));
  const fullQuarter = (q) => yoyView(byDate, quarterDates[q], 'QoQ', 'Quarter', quarterLabel(q), quarterLabel(yrAgoQuarter(q)));

  // --- Week: the latest 7 days (already current); prior = the 7 days before ---
  const last7 = days.slice(-7).map((d) => d.date);
  const wk = yoyView(byDate, last7, 'WoW', 'Week', `wk to ${dayMon(latest)}`, 'yr earlier');
  const prevWeekDates = days.length >= 14 ? days.slice(-14, -7).map((d) => d.date) : null;
  const wkPrior = prevWeekDates
    ? yoyView(byDate, prevWeekDates, 'WoW', 'Week', `wk to ${dayMon(prevWeekDates[prevWeekDates.length - 1])}`, 'yr earlier')
    : null;

  // --- Month: current month to date (MTD); prior = the last full month ---
  let mo;
  let moPrior;
  const mtd = !curMonthDone && (monthDates[curMonth]?.length ?? 0) >= MIN_MTD_DAYS;
  if (mtd) {
    mo = yoyView(byDate, monthDates[curMonth], 'MoM', 'Month', `${monthLabel(curMonth)} MTD`, `${monthLabel(monthsBack(curMonth, 12))} MTD`);
    mo._toDate = 'month to date';
    const pm = completeMonths.filter((m) => m < curMonth).pop();
    moPrior = pm ? fullMonth(pm) : null;
  } else {
    const cm = completeMonths[completeMonths.length - 1];
    const pm = completeMonths[completeMonths.length - 2];
    mo = cm ? fullMonth(cm) : unavailable('MoM', 'Month', 'No complete month yet.');
    moPrior = pm ? fullMonth(pm) : null;
  }

  // --- Quarter: current quarter to date (QTD); prior = the last full quarter ---
  let qt;
  let qtPrior;
  const qtd = !curQuarterDone && (quarterDates[curQuarter]?.length ?? 0) >= MIN_QTD_DAYS;
  if (qtd) {
    qt = yoyView(byDate, quarterDates[curQuarter], 'QoQ', 'Quarter', `${quarterLabel(curQuarter)} QTD`, `${quarterLabel(yrAgoQuarter(curQuarter))} QTD`);
    qt._toDate = 'quarter to date';
    const pq = completeQuarters.filter((q) => q < curQuarter).pop();
    qtPrior = pq ? fullQuarter(pq) : null;
  } else {
    const cq = completeQuarters[completeQuarters.length - 1];
    const pq = completeQuarters[completeQuarters.length - 2];
    qt = cq ? fullQuarter(cq) : unavailable('QoQ', 'Quarter', 'No complete quarter yet.');
    qtPrior = pq ? fullQuarter(pq) : null;
  }

  // --- prior-period headline: the previous full period's YoY read (e.g. MTD Nov gets Oct's
  //     YoY attached). Both are YoY, so the UI's default "prev → last" arrow would mislabel it
  //     ("Oct '26 → Nov '25"); prevChangeLabel names it explicitly. The prior period's level
  //     doesn't chain into this view's year-ago level, so no prevValue. ---
  const attachHead = (view, prior) => {
    if (view.available && prior?.available) {
      view.prevLabel = prior.thisPeriodLabel; // e.g. "Oct '26"
      view.prevChangeLabel = `${prior.thisPeriodLabel} YoY`;
      view.prevValue = null;
      view.prevChangePct = prior.changePct;
      view.prevDirection = prior.direction;
    }
  };
  attachHead(wk, wkPrior);
  attachHead(mo, moPrior);
  attachHead(qt, qtPrior);

  // --- regional breakdown: IATA RPK YoY by world region (latest available month) ---
  let regionRows = [];
  let iataMonth = null;
  let iataPrevMonth = null;
  let industry = null;
  let shares = {};
  try {
    const data = await read('data');
    const ry = data?.series?.rpk_yoy || {};
    const months = data?.months || [];
    shares = data?.market_share || {};
    iataMonth = months[months.length - 1] || null;
    iataPrevMonth = months[months.length - 2] || null;
    const regions = Object.keys(ry).filter((r) => r !== 'Industry');
    regionRows = regions
      .map((r) => {
        const arr = ry[r] || [];
        const v = arr[arr.length - 1];
        const prev = arr[arr.length - 2];
        const share = shares[r];
        const row = {
          label: r,
          thisValue: null,
          lastValue: null,
          changePct: v != null ? v / 100 : null,
          direction: directionOf(v != null ? v / 100 : null),
          bigMove: v != null && Math.abs(v / 100) >= 0.05,
          note: `${share != null ? `${share}% of global RPK` : ''}${
            v != null && prev != null ? `${share != null ? ' · ' : ''}${v - prev >= 0 ? '+' : ''}${(v - prev).toFixed(1)}pp vs prior mo` : ''
          }`,
        };
        // prior IATA month (one step back): the region's YoY the month before — a YoY %, so prevValue stays null
        if (prev != null) {
          row.prevValue = null;
          row.prevChangePct = prev / 100;
          row.prevDirection = directionOf(prev / 100);
        }
        return row;
      })
      .sort((a, b) => (b.changePct ?? -9) - (a.changePct ?? -9));
    const ind = ry['Industry'];
    if (ind && ind.length) industry = { v: ind[ind.length - 1], prev: ind[ind.length - 2] };
  } catch (error) {
    if (repository) throw error;
    /* regional feed optional for legacy HTTP sources */
  }

  // attach the same regional breakdown to each (deseasonalized-YoY) throughput view
  for (const v of [wk, mo, qt]) {
    if (v.available) {
      v.breakdown = regionRows;
      const when = v._toDate ? `${v._toDate} (${windowPhrase(v._dates)})` : `(${windowPhrase(v._dates)})`;
      v.summary = `US passenger throughput ${v.changePct >= 0 ? 'up' : 'down'} ${Math.abs(v.changePct * 100).toFixed(1)}% year-on-year ${when}, running at ${v.thisValue ? (v.thisValue / 1e6).toFixed(2) : '—'}M passengers/day. Globally, ${industry ? `industry RPK is ${industry.v >= 0 ? 'up' : 'down'} ${Math.abs(industry.v).toFixed(1)}% YoY` : 'regional demand is mixed'} — see the regional split.`;
    } else {
      v.breakdown = [];
    }
    delete v._dates;
    delete v._tMean;
    delete v._toDate;
  }

  const views = [wk, mo, qt];
  const def = mo.available ? mo : wk.available ? wk : qt.available ? qt : views[1];

  // insights
  const insights = [];
  insights.push({
    title: 'US demand: current to the latest TSA day',
    body: `TSA checkpoint throughput is tracked daily and is current to ${dayMonYr(latest)}, and the month and quarter views run to that day (MTD / QTD). Raw counts swing with the seasons (summer peak, autumn dip), so this dashboard reads demand year-on-year against the same weekdays a year earlier.`,
  });
  if (regionRows.length) {
    const top = regionRows.filter((r) => r.changePct != null).slice(0, 2);
    const bottom = regionRows.filter((r) => r.changePct != null).slice(-2).reverse();
    insights.push({
      title: `Global regional demand (IATA RPK, YoY${iataMonth ? `, ${monthLabel(iataMonth)}` : ''})`,
      body: 'Where passenger traffic is growing and shrinking, by world region, on revenue-passenger-kilometres.',
      bullets: [
        ...top.map((r) => `${r.label}: ${r.changePct >= 0 ? '+' : ''}${(r.changePct * 100).toFixed(1)}% YoY${r.note ? ` (${r.note})` : ''}`),
        ...bottom.map((r) => `${r.label}: ${r.changePct >= 0 ? '+' : ''}${(r.changePct * 100).toFixed(1)}% YoY${r.note ? ` (${r.note})` : ''}`),
      ],
      asOf: iataMonth ? `${iataMonth}-28` : undefined,
    });
  }
  insights.push({
    title: 'On the dates — not frozen, two different clocks',
    body: `The headline (US TSA) is current to ${dayMonYr(latest)}. The regional RPK figures come from IATA, which publishes on a ~2-month lag, so the latest available there is ${
      iataMonth ? monthLabel(iataMonth) : 'about two months back'
    }. Two different reporting clocks, both showing their newest real data — neither is stale.`,
  });

  const block = makeBlock(system, {
    metricLabel: 'US passenger volume (YoY)',
    unit: 'daily pax',
    comparison: def.comparison,
    thisPeriodLabel: def.thisPeriodLabel,
    lastPeriodLabel: def.lastPeriodLabel,
    thisValue: def.thisValue,
    lastValue: def.lastValue,
    changePct: def.changePct,
    direction: def.direction,
    asOf: tsa?._meta?.latest_date || latest,
    breakdown: def.breakdown,
    summary: def.summary,
    notes:
      'US passenger throughput = mean daily TSA checkpoint count vs the same weekdays a year earlier (deseasonalised YoY). Week = latest 7 days; Month / Quarter = the current month / quarter to date (MTD / QTD), or the last full one in its first days. Breakdown = global demand by region (IATA revenue-passenger-km, YoY, latest IATA month — IATA reports on a ~2-month lag).',
  });
  block.views = views;
  block.breakdownNoun = 'world region';
  block.changeNoun = 'RPK growth';
  // The breakdown is IATA's month, not the TSA window above it — label its columns by IATA
  // month so "Nov '26 MTD" never sits over September RPK data.
  if (iataMonth) {
    block.breakdownChangeLabels = {
      prev: iataPrevMonth ? `${monthLabel(iataPrevMonth)} YoY` : undefined,
      this: `${monthLabel(iataMonth)} YoY (latest IATA)`,
    };
  }
  block.prevChangeLabel = def.prevChangeLabel;
  block.breakdownSubtitle = `Global RPK by region · IATA · year-on-year${iataMonth ? ` · ${monthLabel(iataMonth)} (latest available)` : ''}`;
  block.insights = insights;
  return block;
}
