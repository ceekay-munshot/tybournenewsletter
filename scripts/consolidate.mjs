// Consolidate every system in a client's config into one data file for the dashboard.
// A failing connector becomes an honest `error` block — it never aborts the whole run.
//
// Usage: CLIENT=tybourne node scripts/consolidate.mjs   (CLIENT defaults to "tybourne")
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorBlock } from './lib/changeBlock.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CLIENT = process.env.CLIENT || 'tybourne';
const configPath = resolve(ROOT, `clients/${CLIENT}/client.config.json`);
const outPath = resolve(ROOT, `clients/${CLIENT}/data/consolidated.json`);

// One file per connector TYPE. New systems reuse these by name — no new wiring needed.
const CONNECTORS = {
  cpuprices: () => import('./connectors/cpuprices.mjs'),
  taiwanSemiRevenue: () => import('./connectors/taiwanSemiRevenue.mjs'),
  aiComputePricing: () => import('./connectors/aiComputePricing.mjs'),
  schneiderElectric: () => import('./connectors/schneiderElectric.mjs'),
};

const pctStr = (p) => (p == null ? '    —  ' : `${p >= 0 ? '+' : ''}${(p * 100).toFixed(2)}%`);
const arrow = (d) => (d === 'up' ? '▲' : d === 'down' ? '▼' : '•');

async function run() {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const systems = Array.isArray(config.systems) ? config.systems : [];
  const blocks = [];
  let okCount = 0;

  console.log(`\nConsolidating "${config.client?.name ?? CLIENT}" — ${systems.length} system(s)\n`);

  for (const system of systems) {
    const load = CONNECTORS[system.connector];
    if (!load) {
      blocks.push(errorBlock(system, `unknown connector "${system.connector}"`));
      console.log(`  ✗ ${system.name.padEnd(30)} unknown connector "${system.connector}"`);
      continue;
    }
    try {
      const mod = await load();
      const block = await mod.connect(system);
      blocks.push(block);
      if (block.status === 'ok') {
        okCount += 1;
        console.log(
          `  ✓ ${system.name.padEnd(30)} ${arrow(block.direction)} ${pctStr(block.changePct)}` +
            `  ${block.lastPeriodLabel} → ${block.thisPeriodLabel}` +
            `  (${block.breakdown.length} breakdown · as of ${String(block.asOf).slice(0, 10)})`
        );
      } else {
        console.log(`  ⚠ ${system.name.padEnd(30)} status=${block.status} — ${block.statusReason ?? ''}`);
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      blocks.push(errorBlock(system, reason));
      console.log(`  ✗ ${system.name.padEnd(30)} ${reason}`);
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    client: config.client,
    sectors: config.sectors,
    systems: blocks,
  };
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');

  console.log(`\n  ${okCount}/${systems.length} systems ok → ${outPath.replace(ROOT + '/', '')}\n`);
  // Exit non-zero only if EVERY system failed (keeps CI green on partial data).
  if (okCount === 0 && systems.length > 0) process.exitCode = 1;
}

run().catch((e) => {
  console.error('consolidate failed:', e);
  process.exitCode = 1;
});
