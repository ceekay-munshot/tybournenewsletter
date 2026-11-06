# Munshot Consolidated Intelligence Dashboard

A **config-driven, multi-client** monthly intelligence dashboard. It consolidates many
single-topic data sources into **one view** that shows, per topic, **what changed** from
one period to the next going into earnings — with breakdowns, trends and source stamps.

First client: **Tybourne Global Holdings** (published by Munshot).

> **Honesty first.** Every figure is real and source-stamped. Nothing is fabricated or
> interpolated. Each headline names **both** periods explicitly (e.g. `Q3 '26 → Q4 '26`).
> If a connector can't get data it renders an honest empty state — it never guesses.

---

## Scope

- Foundation: React 18 + TypeScript + Vite + Tailwind, hand-rolled dependency-free SVG charts.
- Node 20 ES-module data pipeline (`.mjs`), one connector file per source type.
- **13 working connectors** (all keyless public GETs) across all four sectors, each returning
  a headline `ChangeBlock` plus optional `secondaryMetrics`.
- Overview dashboard: movers chart (all systems, ranked), an "Everything that moved" master
  table (every headline + secondary metric, sortable), and colour-banded sector sections of
  change cards. Per-sector tabs and a generic per-system drill-down (breakdown chart with a
  % / absolute toggle, trend, detail table, and every secondary metric).
- **AI newsletter** (`scripts/newsletter.mjs` → `data/newsletter.json`): a monthly
  going-into-earnings briefing written by Claude on **Amazon Bedrock**, strictly from the real
  figures. Optional — with no key it writes an **honest `no-key` state** and the pipeline still
  succeeds; nothing is fabricated.
- **Podcast monthly summaries** (`scripts/podcast-monthly.mjs` → `data/podcast-monthly.json`): every
  investor-podcast episode in a calendar month (grouped by week — the same per-episode analyses the
  podcast dashboard's weekly summaries are written from) is rolled into **one AI summary per month**
  (the last two complete months, written once a month with the newsletter edition), then a second
  call marks which themes **continued, dropped off, or are new**.
  The Podcast Themes view gets a **Month / Quarter** toggle: two month boxes side by side, each
  clickable for the full month summary (overview, themes, notable numbers, week by week, threads to
  watch). Same Bedrock key as the newsletter; with no key it shows the episode analyses as published
  and matches named topics exactly — nothing fabricated. `data/podcast-archive.json` keeps every
  episode seen in the last 3 months, because the feed only holds each show's latest few episodes.
- In-app **Newsletter tab**: an editorial "intelligence edition" built from the real data
  (masthead, by-the-numbers, movers, per-sector lines, watch list, sources) with the AI prose
  layered on when available. The prose is set in research-note style by a rule-based
  **emphasis engine** (`src/lib/emphasis.ts`): signed moves bold green/red, levels bold, tracked
  names (the dashboards' own rows) in dark ink, period stamps muted, the passage's biggest % move
  and risk words ("worth watching", "outlier") marked — the text itself is never changed.
  **Download PDF** (masthead) saves an A4 file in one click (`src/lib/pdf.ts`): it snapshots the
  edition exactly as it looks on screen and breaks pages cleanly (never through a row, card or
  heading). No print dialog; `Ctrl+P` still uses the `@media print` stylesheet.

Each new system still plugs in with **one config entry + one connector file**; no architectural
changes.

---

## Repo layout

```
clients/<client>/
  client.config.json      # the ONLY client-specific file (sectors + systems + sources)
  data/consolidated.json  # GENERATED + committed (what the UI reads)
  data/newsletter.json    # GENERATED + committed (AI edition, or honest no-key state)
  data/podcast-monthly.json  # GENERATED + committed (monthly podcast summaries + theme comparison)
  data/podcast-archive.json  # GENERATED + committed (rolling 3-month episode archive)
  data/email-log.json     # GENERATED + committed (one entry per month the newsletter was emailed)
scripts/
  consolidate.mjs         # reads config -> runs each connector -> writes consolidated.json
  newsletter.mjs          # consolidated.json -> Bedrock -> newsletter.json (honest no-key state)
  podcast-monthly.mjs     # podcast episodes -> Bedrock -> podcast-monthly.json (+ podcast-archive.json)
  render-newsletter-pdf.mjs  # save the in-app Download PDF file for the email (Playwright)
  send-newsletter-email.mjs  # email the PDF to recipients (retries; records the send)
  edition-check.mjs       # gates for the workflows: is the edition due? should the email send?
  connectors/             # one file per connector TYPE
  lib/                    # http, quarters, changeBlock, bedrock helpers
src/
  lib/                    # data + newsletter loaders, brand tokens, formatters, chart math, icons
  components/ui/          # Card, Tabs, Table, Controls
  components/charts/      # ChartBase, Bars, Columns, LineArea, Sparkline, DivergingBars
  components/             # Header, Footer, MunshotMark, MoversChart, ChangeCard, SectorSection
  tabs/                   # Overview, Newsletter, SectorTab, SystemView
.github/workflows/
  refresh.yml             # every 6h: consolidate (data only); from the 2nd: + AI edition until written
  newsletter-email.yml    # monthly: render PDF + email it once; fails loudly if it can't
  sap-research-refresh.yml  # 1st of month: trigger the SAP deep-research pass once
```

## The data contract — `ChangeBlock`

Every connector returns the same shape (see `src/types.ts`). Key rule: `changePct` is a
**fraction** (`0.157` == `+15.7%`); the UI multiplies by 100. Each block carries `asOf`,
`sourceName`/`sourceUrl`, honest `status`, a `breakdown[]`, and an optional `trend[]`.

## Commands

```bash
npm install
npm run consolidate   # run all connectors -> clients/tybourne/data/consolidated.json
node scripts/newsletter.mjs   # consolidated.json -> AI edition (or honest no-key state)
node scripts/podcast-monthly.mjs   # podcast months -> AI summaries (or honest no-key state)
npm run dev           # local dev server
npm run build         # typecheck + production build -> dist/
npm run preview       # preview the production build
```

The pipeline uses only Node built-ins + global `fetch`, so `npm run consolidate` needs no
install step (handy for CI). `CLIENT=<id> npm run consolidate` targets another client folder.
`newsletter.mjs` runs with **no secrets** too — it just writes the honest `no-key` state.

## Secrets & variables

**Everything builds and renders with no secrets at all.** Without them the connectors still run
(they're keyless) and the newsletter shows the honest `no-key` state. Secrets *enable* the
AI writer, the monthly email and the SAP research refresh — and the monthly workflows **fail
(red, with an email to the repo owner) when theirs are missing**, rather than skipping quietly. Set these in **GitHub → Settings → Secrets and
variables → Actions**.

### AI newsletter + podcast monthly summaries (Amazon Bedrock) — used by `refresh.yml` (monthly edition run)

| Name | Kind | Required? | What it is |
| --- | --- | --- | --- |
| `BEDROCK_API_KEY` | **secret** | to enable AI | Bedrock API key (console-minted), sent as `Authorization: Bearer …`. No AWS SDK / SigV4. |
| `AWS_REGION` | variable | optional | Region for the Converse endpoint. Defaults to `us-east-1`. |
| `BEDROCK_MODEL_IDS` | variable | optional | Comma-separated model/inference-profile IDs, tried **in order** (first that works wins). |

**The key alone is enough.** With `BEDROCK_MODEL_IDS` unset the writers use Claude Sonnet 4.6 on
Bedrock's global cross-region profile (no regional price premium), then Claude Haiku 4.5 as a
cheaper fallback:

```
global.anthropic.claude-sonnet-4-6,global.anthropic.claude-haiku-4-5-20251001-v1:0
```

Set the variable only to override that list with IDs enabled in **your** account (Bedrock → Model
access); the client calls the Converse API, so use ARN-versioned models / inference profiles. The
writer falls through `400/403/404` to the next ID and retries `429/5xx`; the model that answered is
stamped into the output. If the key is missing, the files are written with `status: "no-key"` —
never fabricated.

**AI runs once a month, not on every refresh.** The 6-hourly refresh is data-only: no model
call, and the last AI edition (newsletter prose + podcast month summaries) stays as it is while
the podcast episode archive keeps growing. The AI edition is **due from the 2nd of each month at
06:00 UTC**: every refresh run from then on writes it until an OK edition for this month is on
file, so a scheduled run GitHub drops or delays, or a failed model call, is simply retried on the
next run (a failed attempt keeps the previous edition rather than blanking it). Once the edition
is pushed, the refresh starts the newsletter email. You can also write one by hand by running
*Refresh consolidated data* with **ai_edition** ticked. An edition covers the last
two complete months and reuses any month already summarised after it ended, so a normal edition is
about three calls: one new month, the theme comparison, and the newsletter. Every call logs its
input/output tokens in the Actions log.

### Monthly email — used by `newsletter-email.yml`

The email goes out **once a month, as soon as that month's AI edition exists**: the refresh run
that writes the edition starts it, and its own schedule retries twice a day from the 2nd to the
9th as a backup. Each successful send is recorded in `clients/tybourne/data/email-log.json`, so
every later run that month is a no-op. Delivery is through the **Munshot mail service** (the same
one the podcast dashboard uses) — a single bearer-token endpoint, so there's no third-party
account and no sender-domain verification to set up. The run **fails** (and GitHub emails the repo
owner) if either of the two required settings below is missing, or if the month's AI edition still
isn't written 48 hours after it was due. To send a **test** of the current edition to yourself
first, run *Email monthly newsletter* by hand with **recipient_override** set to your address
(e.g. `ceekay@muns.io`) — it sends only there and does not record the monthly send. To resend, use
**force**.

| Name | Kind | Required? | What it is |
| --- | --- | --- | --- |
| `MUNSHOT_EMAIL_TOKEN` | **secret** | to send | Bearer key for the Munshot mail service (the same token the podcast repo uses). |
| `NEWSLETTER_RECIPIENTS` | variable | to send | Comma-separated recipient addresses. |
| `SITE_URL` | variable | optional | Live dashboard URL, linked in the email body (and used to render the **deployed** route for the PDF). |
| `EMAIL_API_URL` | variable | optional | Override the mail endpoint (defaults to the Munshot raw-email endpoint). |

### Subscribing / getting the edition from the dashboard

Click the **Subscribe** button in the header (or open `/?subscribe`) to open the panel. From one
email box, no password, there are two actions:

- **Email it to me now** — sends the current edition to that address straight away (see the next
  section). No subscription needed.
- **Subscribe monthly** — adds the address to the automatic monthly send.

Subscribers are **merged** with `NEWSLETTER_RECIPIENTS` at send time (deduped), so either source
works. Viewing the full list and removing someone are tucked behind a small admin unlock, so the
list stays private and only an admin can remove.

It's served by a Cloudflare **Pages Function** (`functions/api/recipients.ts`): the site is a Pages
static SPA (see `wrangler.jsonc`), and Pages maps that one file to the `/api/recipients` route
automatically — no Worker script. It commits **only** `clients/tybourne/data/recipients.json` via
the GitHub Contents API (emails validated, list capped), so it can't touch anything else in the
repo. Set these on the Pages project (Cloudflare dashboard → **Workers &amp; Pages** → the
`tybournenewsletter` Pages project → **Settings → Variables and secrets**):

| Name | Kind | What it is |
| --- | --- | --- |
| `GITHUB_TOKEN` | **secret** · required | A fine-grained GitHub token on **this repo only**. Needs **Contents: read/write** (to save the subscriber list) and, for the "email me now" button below, **Actions: read/write** (to start the sender). |
| `ADMIN_TOKEN` | **secret** · optional | A password for the admin **view/remove** only. Subscribing never needs it. |

Until `GITHUB_TOKEN` is set, the panel shows a "not configured" message and the monthly send
simply uses `NEWSLETTER_RECIPIENTS` as before. (Public subscribe has basic abuse protection —
email validation, dedupe and a list cap; add a Cloudflare Turnstile later if spam appears.)

#### "Email it to me now"

The **Email it to me now** button sends the current edition to the typed address straight away —
for when someone wants it in their inbox instead of waiting for the monthly send. No subscription
is required. It's served by a second Pages Function (`functions/api/send-now.ts`) at
`/api/send-now`. Rather than render the email itself, it **starts the real monthly sender** (the
`newsletter-email.yml` workflow) aimed at that one address via the workflow's `recipient_override`
input — so the person gets the **exact same edition, PDF attached**, arriving in a minute or two.
It forces past the "already sent this month" gate and is **not** recorded as the monthly send, so
the real monthly blast to everyone still goes out as normal.

This button is what needs the token's **Actions: read/write** scope; without it the button returns
a clear "token needs Actions permission" error and the rest of the panel still works fine.

**Abuse note:** `/api/send-now` is a public endpoint and each call starts a CI run and sends one
email (the address is validated and must be a single mailbox, and every recipient is recorded in
the workflow run history). The sender's `concurrency` group serialises runs, but before heavy
public exposure put bot protection in front of it — a **Cloudflare Turnstile** check is the
intended next step (see the Turnstile note above).

### Monthly SAP research refresh — used by `sap-research-refresh.yml`

The SAP dashboard scores sentiment daily, but its lifted "Key Findings" come from an expensive
deep-research pass in the source repo (`ceekay-munshot/sap`) that only runs on demand — so those
findings go stale unless something re-triggers them. This workflow presses that button on the 1st
of each month (ahead of the newsletter), with three chances that day; it first checks the sap repo
and does nothing if research was already dispatched this month. With no token the run **fails**.

| Name | Kind | Required? | What it is |
| --- | --- | --- | --- |
| `SAP_RESEARCH_DISPATCH_TOKEN` | **secret** | to trigger | A PAT that can send a `repository_dispatch` to `ceekay-munshot/sap` (fine-grained: *Contents* + *Actions* read/write on that repo; or a classic token with `repo`). |

The refreshed findings are committed to the sap repo's `dashboard.json`; the next 6-hourly
`refresh.yml` run lifts them automatically. **Simpler alternative (no token):** add the same
`schedule: - cron: '7 6 1 * *'` block directly to `ceekay-munshot/sap`'s `research.yml`, which
already holds the Firecrawl + model secrets it needs, and delete `sap-research-refresh.yml`.

## Deploy (Cloudflare Pages)

- Build command: `npm run build`
- Output directory: `dist`
- `vite.config.ts` uses `base: './'` so assets resolve at any mount path.

## Adding a client

Copy `clients/tybourne/` to `clients/<id>/`, edit `client.config.json`, run
`CLIENT=<id> npm run consolidate`, and set `VITE_CLIENT=<id>` at build time. Same engine,
new config folder.

## Adding a system

1. Add an entry to the client's `systems[]` with a `connector` name + `source`.
2. If it's a new source type, add `scripts/connectors/<name>.mjs` exporting
   `async function connect(system) -> ChangeBlock` and register it in `scripts/consolidate.mjs`.
   Existing UI (Overview card, movers bar, drill-down) renders it automatically.

## Branding

The header **and** the newsletter masthead render `public/munshot-logo.png` when present and
fall back to a crisp built-in gradient "Munshot" wordmark otherwise (`src/components/MunshotMark.tsx`).
The automatic fetch of `https://www.muns.io/logo.png` is currently blocked by that host's edge,
so the branded wordmark fallback is in use — drop the real file at `public/munshot-logo.png` and
both lockups pick it up automatically, no code change.

## Systems & sources

| Sector | System | Source | Cadence |
| --- | --- | --- | --- |
| Technology | CPU Prices | PassMark / cpubenchmark.net (street price) | QoQ (QTD) |
| Technology | Taiwan Semiconductor Revenue | Taiwan MOPS / TWSE monthly filings | QoQ |
| Technology | AI Compute Pricing | pricepertoken.com / getdeploying.com | QoQ (QTD) |
| Technology | SAP AI Strategy | HN / Reddit / StackExchange + SAP docs | QoQ (daily→91d) |
| Technology | Hugging Face Activity | Hugging Face Hub | MoM |
| Technology | AI Model Intelligence | OpenRouter / UBS / SEC | QoQ |
| Technology | Texas Instruments Prices | Mouser / UBS index | QoQ (stale ~Apr '26) |
| Technology | GPU Cloud Pricing | getdeploying.com | QoQ (QTD) |
| Industrial | Schneider Electric | Graybar distributor pricing | QoQ (QTD) |
| Industrial | Airline Demand | TSA.gov + IATA | QoQ |
| Financial | 13F Fund Holdings | SEC EDGAR 13F filings | QoQ |
| Financial | Nubank | BCB / IF.data / issuer filings | QoQ (pp) |
| Macro | Podcast Themes | Investor podcasts | QoQ (QTD) |
