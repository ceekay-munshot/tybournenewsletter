// Tiny keyless GET helper with timeout + exponential-backoff retry.
// Node 20+ has global fetch/AbortController.

async function getRaw(url, { timeoutMs = 30000, retries = 3, accept = 'application/json' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctl.signal,
        headers: { accept, 'user-agent': 'munshot-consolidate/1.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function getJson(url, opts = {}) {
  const res = await getRaw(url, { ...opts, accept: 'application/json' });
  return res.json();
}

export async function getText(url, opts = {}) {
  const res = await getRaw(url, { ...opts, accept: 'text/plain,*/*' });
  return res.text();
}
