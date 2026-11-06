// Newsletter panel, opened from the header Subscribe button (or /?subscribe).
// Two no-password actions from one email box: "Email it to me now" sends the current
// edition straight away, and "Subscribe monthly" adds the address to the monthly send.
// Managing the list (view / remove) is tucked behind a small admin unlock.
import { useCallback, useState } from 'react';
import { Mail, Plus, Trash2, Loader2, X, Check, AlertTriangle, Lock, Send } from 'lucide-react';

const TOKEN_KEY = 'tybourne:admin-token';
const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

interface Props {
  onClose: () => void;
}

export function RecipientsAdmin({ onClose }: Props) {
  // Public subscribe
  const [email, setEmail] = useState('');
  const [subscribing, setSubscribing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);
  // "Email me the latest edition now" — on the subscribed-success screen.
  const [lastEmail, setLastEmail] = useState('');
  const [sendNow, setSendNow] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [sendNowError, setSendNowError] = useState<string | null>(null);

  // Admin manage (optional)
  const [manage, setManage] = useState(false);
  const [token, setToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) ?? '');
  const [unlocked, setUnlocked] = useState(false);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);

  const subscribe = async () => {
    const e = email.trim();
    if (!EMAIL_RE.test(e)) {
      setSubError('Enter a valid email address.');
      return;
    }
    setSubscribing(true);
    setSubError(null);
    setSendNowError(null);
    try {
      const r = await fetch('/api/recipients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: e }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || `Couldn't subscribe (HTTP ${r.status}).`);
      setSubscribed(true);
    } catch (err) {
      setSubError(err instanceof Error ? err.message : 'Could not subscribe.');
    } finally {
      setSubscribing(false);
    }
  };

  // Send the current edition to the typed address right now — no subscription needed.
  // The backend starts the real monthly sender for that one address (PDF included), so
  // it lands in a minute or two — hence the "on its way" copy rather than "sent".
  const emailMeNow = async () => {
    const e = email.trim();
    if (!EMAIL_RE.test(e)) {
      setSendNowError('Enter a valid email address.');
      setSendNow('error');
      return;
    }
    setLastEmail(e);
    setSendNow('sending');
    setSendNowError(null);
    setSubError(null);
    try {
      const r = await fetch('/api/send-now', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: e }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || `Couldn't send (HTTP ${r.status}).`);
      setSendNow('sent');
    } catch (err) {
      setSendNow('error');
      setSendNowError(err instanceof Error ? err.message : 'Could not send.');
    }
  };

  const load = useCallback(async (tok: string) => {
    setLoading(true);
    setAdminError(null);
    try {
      const r = await fetch('/api/recipients', { headers: { authorization: `Bearer ${tok}` } });
      if (r.status === 401) {
        setAdminError('Wrong admin password.');
        return;
      }
      if (r.status === 503) {
        setAdminError('Admin view isn’t configured — set ADMIN_TOKEN on the Pages project.');
        setUnlocked(true);
        return;
      }
      if (!r.ok) throw new Error(`Couldn't load (HTTP ${r.status}).`);
      const data = (await r.json()) as { recipients?: string[] };
      setRecipients(Array.isArray(data.recipients) ? data.recipients : []);
      setUnlocked(true);
      localStorage.setItem(TOKEN_KEY, tok);
    } catch (e) {
      setAdminError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, []);

  const remove = async (addr: string) => {
    setBusy(addr);
    setAdminError(null);
    try {
      const r = await fetch('/api/recipients', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ email: addr }),
      });
      if (!r.ok) throw new Error(`Couldn't remove (HTTP ${r.status}).`);
      const data = (await r.json()) as { recipients?: string[] };
      setRecipients(data.recipients ?? []);
    } catch (e) {
      setAdminError(e instanceof Error ? e.message : 'Could not remove.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-[60] overflow-y-auto bg-slate-900/55 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div className="relative mx-auto my-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-1 top-1 z-10 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
        >
          <X size={16} strokeWidth={2.4} />
        </button>

        <div className="rounded-2xl bg-white p-6 shadow-pop ring-1 ring-slate-200">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white">
              <Mail size={17} />
            </span>
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900">Get the edition by email</h1>
              <p className="text-[12px] text-slate-500">Have the current Tybourne intelligence edition sent to you now, or subscribe to get it every month.</p>
            </div>
          </div>

          <form
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault();
              void emailMeNow();
            }}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                // editing the address clears any stale confirmations for a previous one
                setSubError(null);
                setSendNowError(null);
                setSubscribed(false);
                if (sendNow !== 'sending') setSendNow('idle');
              }}
              placeholder="you@company.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
              autoFocus
            />

            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="submit"
                disabled={sendNow === 'sending'}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
              >
                {sendNow === 'sending' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} strokeWidth={2.2} />}
                {sendNow === 'sending' ? 'Sending…' : 'Email it to me now'}
              </button>
              <button
                type="button"
                onClick={() => void subscribe()}
                disabled={subscribing}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {subscribing ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} strokeWidth={2.2} />}
                {subscribing ? 'Adding…' : 'Subscribe monthly'}
              </button>
            </div>

            {sendNow === 'sent' && (
              <p className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] font-medium text-emerald-700 ring-1 ring-emerald-100">
                <Send size={13} className="shrink-0" /> On its way to {lastEmail} — it&rsquo;ll arrive in a minute or two.
              </p>
            )}
            {subscribed && (
              <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] font-medium text-emerald-700 ring-1 ring-emerald-100">
                <Check size={13} className="shrink-0" /> You&rsquo;re on the monthly list.
              </p>
            )}
            {(sendNowError || subError) && (
              <p className="mt-2 flex items-center gap-1.5 text-[12px] text-rose-600">
                <AlertTriangle size={13} className="shrink-0" /> {sendNowError || subError}
              </p>
            )}

            <p className="mt-3 text-[11.5px] leading-relaxed text-slate-400">
              <span className="font-semibold text-slate-500">Email it to me now</span> sends you the current
              edition (PDF included) in a minute or two. <span className="font-semibold text-slate-500">Subscribe
              monthly</span> adds you to the automatic monthly send.
            </p>
          </form>
        </div>

        {/* Admin: manage the list (view / remove). Tucked away — subscribing never needs it. */}
        <div className="mt-4 text-center">
          {!manage ? (
            <button onClick={() => setManage(true)} className="text-[12px] font-medium text-slate-400 hover:text-slate-600">
              Manage recipients (admin)
            </button>
          ) : (
            <div className="rounded-2xl bg-white p-5 text-left shadow-card ring-1 ring-slate-200/70">
              {!unlocked ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void load(token);
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
                      placeholder="ADMIN_TOKEN"
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                    />
                    <button type="submit" disabled={!token || loading} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                      {loading ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />} Unlock
                    </button>
                  </div>
                  {adminError && <p className="mt-2 text-[12px] text-rose-600">{adminError}</p>}
                </form>
              ) : (
                <>
                  <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-400">Recipients ({recipients.length})</div>
                  {adminError && (
                    <p className="mb-2 flex items-center gap-1.5 text-[12px] text-rose-600">
                      <AlertTriangle size={13} /> {adminError}
                    </p>
                  )}
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {recipients.length === 0 ? (
                      <li className="px-3 py-5 text-center text-[13px] text-slate-400">No recipients yet.</li>
                    ) : (
                      recipients.map((addr) => (
                        <li key={addr} className="flex items-center justify-between gap-2 px-3 py-2.5">
                          <span className="truncate text-sm text-slate-700">{addr}</span>
                          <button
                            onClick={() => void remove(addr)}
                            disabled={!!busy}
                            title="Remove"
                            className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                          >
                            {busy === addr ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** True when the URL asks for the subscribe panel (/?subscribe or /?admin=recipients). */
export function wantsRecipientsAdmin(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.has('subscribe')) return true; // /?subscribe (with or without a value)
  const v = (params.get('admin') ?? window.location.hash.replace('#', '')).toLowerCase();
  return v === 'recipients';
}
