// Use integer nanodollars. Charge a worst-case reservation before each AWS request.
// An interrupted request retains its reservation until it can be reconciled.
const LIMIT = 40_000_000_000;
const prices = {
  'us.anthropic.claude-haiku-4-5-20251001-v1:0': { input: 1100, output: 5500, write: 1375, read: 110, context: 200000 },
  'us.anthropic.claude-opus-5': { input: 5500, output: 27500, write: 6875, read: 550, context: 1000000 },
};
export async function meter(bucket, command, now = new Date()) {
  const currentMonth = now.toISOString().slice(0, 7);
  const { op, month = currentMonth, id, model, maxTokens, usage } = command;
  if (op === 'status') {
    const obj = await bucket.get('budget/' + currentMonth + '.json');
    const used = obj ? (await obj.json()).used : 0;
    return Response.json({ month: currentMonth, used, limit: LIMIT });
  }
  if (!/^\d{4}-\d{2}$/.test(month) || !/^[a-f0-9-]{36}$/.test(id || '') || !['reserve', 'settle'].includes(op)) return new Response('Invalid request', { status: 400 });
  const key = 'budget/' + month + '.json';
  for (let attempt = 0; attempt < 6; attempt++) {
    const obj = await bucket.get(key);
    const ledger = obj ? await obj.json() : { used: 0, pending: {} };
    if (op === 'reserve') {
      const rates = prices[model];
      if (month !== currentMonth || !Object.hasOwn(prices, model) || !Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 16384) return new Response('Unsupported model or request', { status: 400 });
      if (ledger.pending[id]) return new Response('Duplicate reservation', { status: 409 });
      const amount = rates.context * rates.write + maxTokens * rates.output;
      if (ledger.used + amount > LIMIT) return new Response('Weekly feed paused at its monthly Bedrock budget', { status: 402 });
      ledger.pending[id] = { amount, model };
      ledger.used += amount;
    } else {
      const hold = ledger.pending[id];
      if (!hold) return new Response('No matching reservation', { status: 409 });
      const rates = prices[hold.model];
      if (!Number.isSafeInteger(usage?.input_tokens) || !Number.isSafeInteger(usage?.output_tokens)) return new Response('Missing metering', { status: 400 });
      const counts = [usage.input_tokens, usage.output_tokens, usage.cache_creation_input_tokens ?? 0, usage.cache_read_input_tokens ?? 0];
      if (!counts.every(n => Number.isSafeInteger(n) && n >= 0)) return new Response('Invalid metering', { status: 400 });
      const actual = counts[0]*rates.input + counts[1]*rates.output + counts[2]*rates.write + counts[3]*rates.read;
      if (!Number.isSafeInteger(actual) || actual > hold.amount) return new Response('Reservation mismatch', { status: 500 });
      ledger.used += actual - hold.amount;
      delete ledger.pending[id];
    }
    const result = await bucket.put(key, JSON.stringify(ledger), { onlyIf: obj ? { etagMatches: obj.etag } : { etagDoesNotMatch: '*' } });
    if (result) return Response.json({ month, id, used: ledger.used });
  }
  return new Response('Concurrent budget update', { status: 409 });
}
