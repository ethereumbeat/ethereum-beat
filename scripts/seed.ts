/**
 * Ethereum Beat — seed/backfill script.
 *
 * Pulls full daily history from growthepie's export endpoints (plus one-shot
 * current values from the other sources) and bulk-inserts into D1 so every
 * range works from the first deploy. Idempotent: INSERT OR REPLACE.
 *
 * Usage:
 *   npm run seed             # local D1 (wrangler dev state)
 *   npm run seed -- --remote # production D1
 *
 * Respectful of growthepie guidance: a handful of broad calls, spaced 1s apart.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { combineRows, blobRows, countL2s, medianFeeRows } from '../worker/sources/growthepie.ts';
import { uptimeDaysAt } from '../worker/sources/uptime.ts';
import { ultrasound } from '../worker/sources/ultrasound.ts';
import { defillama } from '../worker/sources/defillama.ts';
import { beacon } from '../worker/sources/beacon.ts';
import { beaconchain } from '../worker/sources/beaconchain.ts';
import type { Row } from '../worker/sources/types.ts';

const remote = process.argv.includes('--remote');
const target = remote ? '--remote' : '--local';
const today = new Date().toISOString().slice(0, 10);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// wrangler's `d1 execute` (used below via --file) has no parameter binding, so
// downloaded values are serialised through strict, type-checked encoders and
// escaped — no source value can break out of its SQL literal. This keeps
// "bind, don't interpolate" uniform for the seed path.
function sqlText(v: string, field: string): string {
  if (typeof v !== 'string') throw new Error(`${field}: expected string, got ${typeof v}`);
  return "'" + v.replace(/'/g, "''") + "'";
}
function sqlNumber(v: number, field: string): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${field}: expected finite number, got ${v}`);
  return String(v);
}
/** one `(metric_key, date, value)` tuple, every field validated + escaped */
function metricsTuple(r: Row): string {
  // shape guards on the downloaded fields (defence in depth on top of escaping)
  if (!/^[A-Za-z0-9_]+$/.test(r.metric_key)) throw new Error(`bad metric_key: ${JSON.stringify(r.metric_key)}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) throw new Error(`bad date: ${JSON.stringify(r.date)}`);
  return `(${sqlText(r.metric_key, 'metric_key')},${sqlText(r.date, 'date')},${sqlNumber(r.value, 'value')})`;
}

async function getJson<T>(url: string): Promise<T> {
  process.stdout.write(`  fetch ${url} ... `);
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as T;
  console.log('ok');
  await sleep(1000);
  return data;
}

async function main() {
  const rows: Row[] = [];

  console.log('growthepie full-history exports:');
  type GtpRow = { metric_key: string; origin_key: string; date: string; value: number };
  const exportsRaw: GtpRow[] = [];
  for (const metric of ['daa', 'txcount', 'throughput', 'stables_mcap', 'tvl', 'txcosts']) {
    exportsRaw.push(...(await getJson<GtpRow[]>(`https://api.growthepie.com/v1/export/${metric}.json`)));
  }
  rows.push(...combineRows(exportsRaw, today));
  rows.push(...medianFeeRows(exportsRaw, today));

  const da = await getJson<GtpRow[]>('https://api.growthepie.com/v1/da_fundamentals.json');
  rows.push(...blobRows(da, today));

  const master = await getJson<{ chains: Record<string, { chain_type: string; deployment: string }> }>(
    'https://api.growthepie.com/v1/master.json',
  );
  rows.push({ metric_key: 'l2_count', date: today, value: countL2s(master) });

  // uptime: computable for the whole of history
  for (let d = Date.parse('2015-07-31T00:00:00Z'); ; d += 86_400_000) {
    const date = new Date(d).toISOString().slice(0, 10);
    if (date > today) break;
    rows.push({ metric_key: 'uptime_days', date, value: uptimeDaysAt(date) });
  }

  // one-shot current values from live sources (history not freely available)
  const env = {
    BEACONCHAIN_API_KEY: process.env['BEACONCHAIN_API_KEY'],
  } as Env;
  for (const source of [ultrasound, defillama, beacon, beaconchain]) {
    try {
      rows.push(...(await source.fetchDaily(env)));
      console.log(`  ${source.name} ok`);
    } catch (err) {
      console.warn(`  ${source.name} FAILED (skipped): ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n${rows.length} rows total; writing SQL and inserting into D1 (${target})`);
  rmSync('.seed-tmp', { recursive: true, force: true });
  mkdirSync('.seed-tmp', { recursive: true });

  const CHUNK = 1000;
  const files: string[] = [];
  for (let i = 0; i < rows.length; i += CHUNK * 10) {
    const fileRows = rows.slice(i, i + CHUNK * 10);
    let sql = '';
    for (let j = 0; j < fileRows.length; j += CHUNK) {
      const values = fileRows
        .slice(j, j + CHUNK)
        .map(metricsTuple)
        .join(',');
      sql += `INSERT OR REPLACE INTO metrics (metric_key, date, value) VALUES ${values};\n`;
    }
    const file = `.seed-tmp/seed_${files.length}.sql`;
    writeFileSync(file, sql);
    files.push(file);
  }

  execFileSync('npx', ['wrangler', 'd1', 'execute', 'ethereum_beat', target, '--file', 'db/schema.sql', '-y'], { stdio: 'inherit' });
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'ethereum_beat', target, '--file', 'db/meta.sql', '-y'], { stdio: 'inherit' });
  for (const file of files) {
    console.log(`  executing ${file}`);
    execFileSync('npx', ['wrangler', 'd1', 'execute', 'ethereum_beat', target, '--file', file, '-y'], { stdio: 'inherit' });
  }
  rmSync('.seed-tmp', { recursive: true, force: true });
  console.log('\nSeed complete. The first request to /api/snapshot builds the KV snapshot.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
