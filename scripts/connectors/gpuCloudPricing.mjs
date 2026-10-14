// GPU Cloud Pricing — getdeploying.com street rental rates, QoQ per SKU.
// GET history?view=quarter -> qoq{sku:{qoqPct,currentClose,priorClose,currentQuarter,priorQuarter}}.
import { getJson } from '../lib/http.mjs';
import { quarterLabel, currentQuarterId } from '../lib/quarters.mjs';
import { makeBlock, directionOf, pctChange } from '../lib/changeBlock.mjs';

export async function connect(system) {
  const d = await getJson(system.source.history);
  const qoq = d?.qoq || {};
  const skus = Object.keys(qoq).filter((s) => qoq[s]?.status === 'ok' && qoq[s].priorClose);
  if (!skus.length) throw new Error('no GPU SKUs with QoQ data');

  const head = qoq['Nvidia H100']?.status === 'ok' ? qoq['Nvidia H100'] : qoq[skus[0]];
  const headName = qoq['Nvidia H100']?.status === 'ok' ? 'Nvidia H100' : skus[0];
  const changePct = pctChange(head.currentClose, head.priorClose);

  const breakdown = skus.map((s) => {
    const o = qoq[s];
    const cp = pctChange(o.currentClose, o.priorClose);
    return { label: s.replace('Nvidia ', ''), thisValue: o.currentClose, lastValue: o.priorClose, changePct: cp, direction: directionOf(cp) };
  }).sort((a, b) => (b.thisValue ?? 0) - (a.thisValue ?? 0));

  const curQ = head.currentQuarter;
  const qtd = curQ === currentQuarterId() ? ' (QTD)' : '';
  const asOf = d.latestRealSnapshotDate || d.latestDateAny || new Date().toISOString().slice(0, 10);

  return makeBlock(system, {
    unit: '$/GPU-hr',
    comparison: 'QoQ',
    thisPeriodLabel: `${quarterLabel(curQ)}${qtd}`,
    lastPeriodLabel: quarterLabel(head.priorQuarter),
    thisValue: head.currentClose,
    lastValue: head.priorClose,
    changePct,
    asOf,
    breakdown,
    notes: `Street GPU rental rates. Headline = ${headName}; breakdown covers ${skus.length} SKUs.`,
  });
}
