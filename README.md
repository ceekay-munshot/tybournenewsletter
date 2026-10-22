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
  layered on when available. A prominent **Download PDF** button (header + masthead) prints it
  via a dedicated `@media print` stylesheet that keeps colour and charts.

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
scripts/
  consolidate.mjs         # reads config -> runs each connector -> writes consolidated.json
  newsletter.mjs          # consolidated.json -> Bedrock -> newsletter.json (honest no-key state)
  podcast-monthly.mjs     # podcast episodes -> Bedrock -> podcast-monthly.json (+ podcast-archive.json)
  render-newsletter-pdf.mjs  # render the Newsletter edition to an A4 PDF (Playwright)
  send-newsletter-email.mjs  # email the PDF to recipients (skips cleanly if unconfigured)
  connectors/             # one file per connector TYPE
  lib/                    # http, quarters, changeBlock, bedrock helpers
src/
  lib/                    # data + newsletter loaders, brand tokens, formatters, chart math, icons
  components/ui/          # Card, Tabs, Table, Controls
  components/charts/      # ChartBase, Bars, Columns, LineArea, Sparkline, DivergingBars
  components/             # Header, Footer, MunshotMark, MoversChart, ChangeCard, SectorSection
  tabs/                   # Overview, Newsletter, SectorTab, SystemView
.github/workflows/
  refresh.yml             # every 6h: consolidate (data only); 2nd of month: + AI edition
  newsletter-email.yml    # monthly (optional): render PDF + email it; skips if unconfigured
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
(they're keyless) and the newsletter shows the honest `no-key` state. Secrets only *enable* the
AI writer and the optional monthly email. Set these in **GitHub → Settings → Secrets and
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
the podcast episode archive keeps growing. The AI edition is written by one scheduled run on the
**2nd of each month at 06:41 UTC** (ahead of the 13:17 newsletter email, which reuses it), or by
running *Refresh consolidated data* by hand with **ai_edition** ticked. An edition covers the last
two complete months and reuses any month already summarised after it ended, so a normal edition is
about three calls: one new month, the theme comparison, and the newsletter. Every call logs its
input/output tokens in the Actions log.

### Monthly email (optional) — used by `newsletter-email.yml`

The whole `send` job is **skipped cleanly** (a log line, not a failure) unless both of these are set:

| Name | Kind | Required? | What it is |
| --- | --- | --- | --- |
| `EMAIL_TOKEN` | **secret** | to send | Bearer key for the email API (default provider **Resend**, `api.resend.com`). |
| `NEWSLETTER_RECIPIENTS` | variable | to send | Comma-separated recipient addresses. |
| `EMAIL_FROM` | variable | optional | `Name <from@domain>` (verified sender). Defaults to a Munshot address. |
| `EMAIL_API_URL` | variable | optional | Override the email endpoint if not using Resend. |
| `SITE_URL` | variable | optional | Render the **deployed** route (e.g. `https://tybournenewsletter.pages.dev`) instead of the freshly-built `./dist`. |

### Monthly SAP research refresh (optional) — used by `sap-research-refresh.yml`

The SAP dashboard scores sentiment daily, but its lifted "Key Findings" come from an expensive
deep-research pass in the source repo (`ceekay-munshot/sap`) that only runs on demand — so those
findings go stale unless something re-triggers them. This workflow presses that button on the 1st
of each month (ahead of the newsletter). It's **gated**: with no token it logs a notice and exits 0.

| Name | Kind | Required? | What it is |
| --- | --- | --- | --- |
| `SAP_RESEARCH_DISPATCH_TOKEN` | **secret** | to trigger | A PAT that can send a `repository_dispatch` to `ceekay-munshot/sap` (fine-grained: *Contents* + *Actions* read/write on that repo; or a classic token with `repo`). |

The refreshed findings are committed to the sap repo's `dashboard.json`; the next 6-hourly
`refresh.yml` run lifts them automatically. **Simpler alternative (no token):** add the same
`schedule: - cron: '0 6 1 * *'` block directly to `ceekay-munshot/sap`'s `research.yml`, which
already holds the Firecrawl + model secrets it needs.

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
