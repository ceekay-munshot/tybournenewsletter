# Munshot Consolidated Intelligence Dashboard

A **config-driven, multi-client** quarterly intelligence dashboard. It consolidates many
single-topic data sources into **one view** that shows, per topic, **what changed** from
one period to the next going into earnings — with breakdowns, trends and source stamps.

First client: **Tybourne Global Holdings** (published by Munshot).

> **Honesty first.** Every figure is real and source-stamped. Nothing is fabricated or
> interpolated. Each headline names **both** periods explicitly (e.g. `Q3 '26 → Q4 '26`).
> If a connector can't get data it renders an honest empty state — it never guesses.

---

## Phase 1 scope (this repo)

- Foundation: React 18 + TypeScript + Vite + Tailwind, hand-rolled dependency-free SVG charts.
- Node 20 ES-module data pipeline (`.mjs`), one connector file per source type.
- **4 working connectors** (all keyless public GETs): CPU Prices, Taiwan Semiconductor
  Revenue, AI Compute Pricing, Schneider Electric.
- Overview dashboard (movers chart + sector cards), per-sector tabs, and a generic
  per-system drill-down.

Later phases add the remaining 8 systems, an AI-written newsletter, and a downloadable
editorial PDF — each new system plugs in with **one config entry + one connector file**;
no architectural changes.

---

## Repo layout

```
clients/<client>/
  client.config.json      # the ONLY client-specific file (sectors + systems + sources)
  data/consolidated.json  # GENERATED + committed (what the UI reads)
scripts/
  consolidate.mjs         # reads config -> runs each connector -> writes consolidated.json
  connectors/             # one file per connector TYPE
  lib/                    # http, quarters, changeBlock helpers
src/
  lib/                    # data loader, brand tokens, formatters, chart math, icons
  components/ui/          # Card, Tabs, Table, Controls
  components/charts/      # ChartBase, Bars, Columns, LineArea, Sparkline, DivergingBars
  components/             # Header, Footer, MoversChart, ChangeCard, SectorSection
  tabs/                   # Overview, SectorTab, SystemView
.github/workflows/refresh.yml   # re-runs the pipeline every 6h and commits fresh data
```

## The data contract — `ChangeBlock`

Every connector returns the same shape (see `src/types.ts`). Key rule: `changePct` is a
**fraction** (`0.157` == `+15.7%`); the UI multiplies by 100. Each block carries `asOf`,
`sourceName`/`sourceUrl`, honest `status`, a `breakdown[]`, and an optional `trend[]`.

## Commands

```bash
npm install
npm run consolidate   # run all connectors -> clients/tybourne/data/consolidated.json
npm run dev           # local dev server
npm run build         # typecheck + production build -> dist/
npm run preview       # preview the production build
```

The pipeline uses only Node built-ins + global `fetch`, so `npm run consolidate` needs no
install step (handy for CI). `CLIENT=<id> npm run consolidate` targets another client folder.

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

The header shows `public/munshot-logo.png` when present and falls back to a built-in
"Munshot" wordmark otherwise. Drop the real logo at `public/munshot-logo.png` to use it.

## Sources (Phase 1)

| System | Source | Cadence |
| --- | --- | --- |
| CPU Prices | PassMark / cpubenchmark.net (street price) | QoQ (QTD) |
| Taiwan Semiconductor Revenue | Taiwan MOPS / TWSE monthly filings | QoQ |
| AI Compute Pricing | pricepertoken.com / getdeploying.com | QoQ (QTD) |
| Schneider Electric | Graybar distributor pricing | QoQ (QTD) |
