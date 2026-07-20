import type { Row, Source } from './sources/types.ts';
import { growthepie } from './sources/growthepie.ts';
import { beacon } from './sources/beacon.ts';
import { ultrasound } from './sources/ultrasound.ts';
import { defillama } from './sources/defillama.ts';
import { beaconchain } from './sources/beaconchain.ts';
import { uptime } from './sources/uptime.ts';
import { buildSnapshot, SNAPSHOT_KEY } from './snapshot.ts';

const SOURCES: Source[] = [growthepie, beacon, ultrasound, defillama, beaconchain, uptime];

/** The daily cron only needs to top up recent history; seeding owns the past. */
const COLLECT_WINDOW_DAYS = 120;

export interface CollectReport {
  ok: string[];
  failed: { source: string; error: string }[];
  rows: number;
}

export async function upsertRows(db: D1Database, rows: Row[]): Promise<void> {
  const stmt = db.prepare('INSERT OR REPLACE INTO metrics (metric_key, date, value) VALUES (?1, ?2, ?3)');
  for (let i = 0; i < rows.length; i += 100) {
    await db.batch(rows.slice(i, i + 100).map((r) => stmt.bind(r.metric_key, r.date, r.value)));
  }
}

export async function runCollector(env: Env): Promise<CollectReport> {
  const report: CollectReport = { ok: [], failed: [], rows: 0 };
  const cutoff = new Date(Date.now() - COLLECT_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

  for (const source of SOURCES) {
    try {
      const rows = (await source.fetchDaily(env)).filter((r) => r.date >= cutoff);
      await upsertRows(env.DB, rows);
      report.ok.push(source.name);
      report.rows += rows.length;
    } catch (err) {
      // a failing source never blocks the others
      report.failed.push({ source: source.name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const snapshot = await buildSnapshot(env.DB);
  await env.SNAP.put(SNAPSHOT_KEY, JSON.stringify(snapshot));
  console.log('collector run', JSON.stringify(report));
  return report;
}
