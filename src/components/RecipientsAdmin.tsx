// Admin-only recipient manager, opened via /?admin=recipients. Talks to the
// /api/recipients Pages Function (admin-gated). The admin token is kept in
// localStorage so you unlock once per browser. Not linked from the dashboard nav —
// it's a private admin surface, not a public signup.
import { useCallback, useEffect, useState } from 'react';
import { Lock, Mail, Plus, Trash2, Loader2, ArrowLeft, AlertTriangle } from 'lucide-react';

const TOKEN_KEY = 'tybourne:admin-token';
const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

interface Props {
  onClose: () => void;
}

export function RecipientsAdmin({ onClose }: Props) {
  const [token, setToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) ?? '');
  const [unlocked, setUnlocked] = useState(false);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // email being added/removed
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const api = useCallback(
    async (method: string, body?: unknown): Promise<Response> =>
      fetch('/api/recipients', {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    [token],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api('GET');
      if (r.status === 401) {
        setUnlocked(false);
        setError('Wrong admin password.');
        return;
      }
      if (r.status === 503) {
        setError('Not configured yet — set ADMIN_TOKEN and GITHUB_TOKEN on the Cloudflare Pages project.');
        setUnlocked(true);
        return;
      }
      if (!r.ok) throw new Error(`Couldn't load (HTTP ${r.status}).`);
      const data = (await r.json()) as { recipients?: string[] };
      setRecipients(Array.isArray(data.recipients) ? data.recipients : []);
      setUnlocked(true);
      localStorage.setItem(TOKEN_KEY, token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [api, token]);

  // Auto-load if a token is already remembered.
  useEffect(() => {
    if (token && !unlocked) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async () => {
    const email = input.trim();
    if (!EMAIL_RE.test(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(email);
    setError(null);
    try {
      const r = await api('POST', { email });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || `Couldn't add (HTTP ${r.status}).`);
      const data = (await r.json()) as { recipients?: string[] };
      setRecipients(data.recipients ?? []);
      setInput('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (email: string) => {
    setBusy(email);
    setError(null);
    try {
      const r = await api('DELETE', { email });
      if (!r.ok) throw new Error(`Couldn't remove (HTTP ${r.status}).`);
      const data = (await r.json()) as { recipients?: string[] };
      setRecipients(data.recipients ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-xl">
        <button onClick={onClose} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-800">
          <ArrowLeft size={15} /> Back to dashboard
        </button>

        <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-slate-200/70">
          <div className="mb-1 flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white">
              <Mail size={17} />
            </span>
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900">Newsletter recipients</h1>
              <p className="text-[12px] text-slate-500">Who receives the monthly Tybourne intelligence edition.</p>
            </div>
          </div>

          {!unlocked ? (
            <form
              className="mt-5"
              onSubmit={(e) => {
                e.preventDefault();
                void load();
              }}
            >
              <label className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-slate-600">
                <Lock size={13} /> Admin password
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Enter the admin password"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!token || loading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />} Unlock
                </button>
              </div>
              {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}
            </form>
          ) : (
            <div className="mt-5">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void add()}
                  placeholder="add@email.com"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                />
                <button
                  onClick={() => void add()}
                  disabled={!!busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy === input.trim() ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Add
                </button>
              </div>
              {error && (
                <p className="mt-2 flex items-center gap-1.5 text-[12px] text-rose-600">
                  <AlertTriangle size={13} /> {error}
                </p>
              )}

              <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {loading ? (
                  <li className="px-3 py-6 text-center text-[13px] text-slate-400">Loading…</li>
                ) : recipients.length === 0 ? (
                  <li className="px-3 py-6 text-center text-[13px] text-slate-400">
                    No recipients yet. Add one above — they'll get the next monthly edition.
                  </li>
                ) : (
                  recipients.map((email) => (
                    <li key={email} className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <span className="truncate text-sm text-slate-700">{email}</span>
                      <button
                        onClick={() => void remove(email)}
                        disabled={!!busy}
                        title="Remove"
                        className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                      >
                        {busy === email ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </li>
                  ))
                )}
              </ul>

              <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                Saved to the repo and used for the monthly send (merged with any addresses set directly in
                <span className="font-mono"> NEWSLETTER_RECIPIENTS</span>). Admin-only — not a public signup.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** True when the URL asks for the admin panel (/?admin=recipients or #admin=recipients). */
export function wantsRecipientsAdmin(): boolean {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(window.location.search).get('admin') ?? '';
  const v = (q || window.location.hash.replace('#', '')).toLowerCase();
  return v === 'recipients';
}
