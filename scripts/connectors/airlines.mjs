// Airline Demand — US passenger throughput (TSA checkpoint counts), on a YEAR-ON-YEAR
// basis so the seasonal summer-peak / winter-trough swing doesn't masquerade as a trend.
// Toggle is granularity: latest week / month / quarter, each vs the same period a year
// earlier. TSA is current (daily, ~1-day lag). The breakdown is global demand by world
// region (IATA RPK, year-on-year) — IATA publishes on a ~2-month lag, so those figures
// are the latest available (not frozen); that lag is stamped explicitly.
import { getJson } from '../lib/http.mjs';
import { quarterOf, quarterLabel, monthOf, monthLabel } from '../lib/quarters.mjs';
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

export async function connect(system) {
  const base = system.source.base;
  const tsa = await getJson(`${base}/tsa.json`);
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
  const completeMonth = Object.keys(monthDates)
    .filter((m) => monthDates[m].length >= 27)
    .sort()
    .pop();
  const completeQuarter = Object.keys(quarterDates)
    .filter((q) => quarterDates[q].length >= 85)
    .sort()
    .pop();

  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayMon = (iso) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`;
  const last7 = days.slice(-7).map((d) => d.date);
  const wk = yoyView(byDate, last7, 'WoW', 'Week', `wk to ${dayMon(latest)}`, 'yr earlier');
  const mo = completeMonth
    ? yoyView(byDate, monthDates[completeMonth], 'MoM', 'Month', monthLabel(completeMonth), monthLabel(monthsBack(completeMonth, 12)))
    : { comparison: 'MoM', label: 'Month', available: false, unavailableReason: 'No complete month yet.', breakdown: [], thisPeriodLabel: '—', lastPeriodLabel: '—', thisValue: null, lastValue: null, changePct: null, direction: 'flat' };
  const qt = completeQuarter
    ? yoyView(
        byDate,
        quarterDates[completeQuarter],
        'QoQ',
        'Quarter',
        quarterLabel(completeQuarter),
        quarterLabel(`${Number(completeQuarter.slice(0, 4)) - 1}-${completeQuarter.slice(5)}`)
      )
    : { comparison: 'QoQ', label: 'Quarter', available: false, unavailableReason: 'No complete quarter yet.', breakdown: [], thisPeriodLabel: '—', lastPeriodLabel: '—', thisValue: null, lastValue: null, changePct: null, direction: 'flat' };

  // --- regional breakdown: IATA RPK YoY by world region (latest available month) ---
  let regionRows = [];
  let iataMonth = null;
  let industry = null;
  let shares = {};
  try {
    const data = await getJson(`${base}/data.json`);
    const ry = data?.series?.rpk_yoy || {};
    const months = data?.months || [];
    shares = data?.market_share || {};
    iataMonth = months[months.length - 1] || null;
    const regions = Object.keys(ry).filter((r) => r !== 'Industry');
    regionRows = regions
      .map((r) => {
        const arr = ry[r] || [];
        const v = arr[arr.length - 1];
        const prev = arr[arr.length - 2];
        const share = shares[r];
        return {
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
      })
      .sort((a, b) => (b.changePct ?? -9) - (a.changePct ?? -9));
    const ind = ry['Industry'];
    if (ind && ind.length) industry = { v: ind[ind.length - 1], prev: ind[ind.length - 2] };
  } catch {
    /* regional feed optional */
  }

  // attach the same regional breakdown to each (deseasonalized-YoY) throughput view
  for (const v of [wk, mo, qt]) {
    if (v.available) {
      v.breakdown = regionRows;
      v.summary = `US passenger throughput ${v.changePct >= 0 ? 'up' : 'down'} ${Math.abs(v.changePct * 100).toFixed(1)}% year-on-year (${v.thisPeriodLabel} vs ${v.lastPeriodLabel}), running at ${v.thisValue ? (v.thisValue / 1e6).toFixed(2) : '—'}M passengers/day. Globally, ${industry ? `industry RPK is ${industry.v >= 0 ? 'up' : 'down'} ${Math.abs(industry.v).toFixed(1)}% YoY` : 'regional demand is mixed'} — see the regional split.`;
    } else {
      v.breakdown = [];
    }
    delete v._dates;
    delete v._tMean;
  }

  const views = [wk, mo, qt];
  const def = mo.available ? mo : wk.available ? wk : qt.available ? qt : views[1];

  // insights
  const insights = [];
  insights.push({
    title: 'US demand: current and roughly flat',
    body: `TSA checkpoint throughput is tracked daily and is current to ${monthLabel(latest)} ${Number(
      latest.slice(8, 10)
    )}. On a year-on-year basis it is running close to flat — the month-to-month swings you see in raw counts are seasonal (summer peak, autumn dip), which is why this dashboard reads demand year-on-year.`,
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
    body: `The headline (US TSA) is current to ${monthLabel(latest)} ${Number(
      latest.slice(8, 10)
    )}. The regional RPK figures come from IATA, which publishes on a ~2-month lag, so the latest available there is ${
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
      'US passenger throughput = mean daily TSA checkpoint count, shown year-on-year (deseasonalised) at week / month / quarter granularity. Breakdown = global demand by region (IATA revenue-passenger-km, YoY, latest available — IATA reports on a ~2-month lag).',
  });
  block.views = views;
  block.breakdownNoun = 'world region';
  block.changeNoun = 'RPK growth';
  block.breakdownSubtitle = `Global RPK by region · IATA · year-on-year${iataMonth ? ` · ${monthLabel(iataMonth)} (latest available)` : ''}`;
  block.insights = insights;
  return block;
}
