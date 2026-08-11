/**
 * ROADMAP channel (CH 07) data layer.
 *
 * D1 (roadmap_upgrades + roadmap_eips) → a KV snapshot the /roadmap page and
 * /api/roadmap render from. The daily cron calls refreshRoadmap(), which pulls
 * the canonical machine fields from Forkcast's source data and rebuilds the
 * snapshot. Editorial fields (plain-language summaries, CROPS tags) are never
 * touched by the refresh — they are hand-authored in db/roadmap.sql.
 */

export const ROADMAP_KEY = 'roadmap:latest';

export interface RoadmapEip {
  eip: number;
  title: string;
  inclusion: string;
  summary: string | null;
  /** fuller why-it-matters (migration 007) */
  rationale: string | null;
  /** EL | CL | EL+CL — execution / consensus layer (migration 007) */
  layer: string | null;
  crops: string | null;
  /** Verge | Purge — horizon thematic grouping; null for dated upgrades (migration 008) */
  phase: string | null;
  sort: number;
}

export interface RoadmapUpgrade {
  id: string;
  name: string;
  codename: string | null;
  status: string;
  /** upgrade | horizon — horizon is un-dated long-range research (migration 008) */
  category: string | null;
  sort: number;
  target_label: string | null;
  date_locked: number;
  activation_date: string | null;
  summary: string | null;
  significance: string | null;
  crops: string | null;
  meta_eip_url: string | null;
  source_name: string | null;
  source_url: string | null;
  eips: RoadmapEip[];
}

export interface RoadmapSnapshot {
  generated_at: string;
  upgrades: RoadmapUpgrade[];
}

/** Build the roadmap snapshot from D1: upgrades ordered along the timeline,
 *  each with its EIP tokens. */
export async function buildRoadmapSnapshot(db: D1Database): Promise<RoadmapSnapshot> {
  const upgrades = (
    await db.prepare('SELECT * FROM roadmap_upgrades ORDER BY sort').all<Omit<RoadmapUpgrade, 'eips'>>()
  ).results;
  const eips = (
    await db.prepare('SELECT * FROM roadmap_eips ORDER BY upgrade_id, sort').all<RoadmapEip & { upgrade_id: string }>()
  ).results;

  const byUpgrade = new Map<string, RoadmapEip[]>();
  for (const e of eips) {
    const { upgrade_id, ...eip } = e;
    (byUpgrade.get(upgrade_id) ?? byUpgrade.set(upgrade_id, []).get(upgrade_id)!).push(eip);
  }

  return {
    generated_at: new Date().toISOString(),
    upgrades: upgrades.map((u) => ({ ...u, eips: byUpgrade.get(u.id) ?? [] })),
  };
}

// ── Forkcast refresh ───────────────────────────────────────────────────────

const FORKCAST_URL = 'https://raw.githubusercontent.com/ethereum/forkcast/main/src/data/upgrades.ts';

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** "Dec 3, 2025" → "2025-12-03"; a bare year or unparseable string → null. */
export function parseForkcastDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return null;
  const mon = MONTHS[m[1]!.toLowerCase()];
  if (!mon) return null;
  return `${m[3]}-${mon}-${m[2]!.padStart(2, '0')}`;
}

/** Pull a single-quoted field's value from one upgrade block (handles \' ). */
function field(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`${name}:\\s*'((?:[^'\\\\]|\\\\.)*)'`));
  return m ? m[1]!.replace(/\\'/g, "'") : undefined;
}

export interface ForkcastUpgrade {
  id: string;
  name?: string;
  status?: string;
  activationDate?: string;
  metaEipLink?: string;
}

/** Extract the machine fields for each upgrade block in Forkcast's upgrades.ts.
 *  Tolerant by design: format drift yields fewer fields, never a throw. */
export function parseForkcast(src: string): ForkcastUpgrade[] {
  const out: ForkcastUpgrade[] = [];
  const idRe = /id:\s*'([a-z0-9-]+)'/g;
  const starts: { id: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = idRe.exec(src))) starts.push({ id: m[1]!, index: m.index });
  for (let i = 0; i < starts.length; i++) {
    const block = src.slice(starts[i]!.index, starts[i + 1]?.index ?? src.length);
    out.push({
      id: starts[i]!.id,
      name: field(block, 'name'),
      status: field(block, 'status'),
      activationDate: field(block, 'activationDate'),
      metaEipLink: field(block, 'metaEipLink'),
    });
  }
  return out;
}

export interface RoadmapRefreshReport {
  fetched: boolean;
  wentLive: string[];
  metaUpdated: string[];
  unknownUpstream: string[];
  error?: string;
}

/**
 * Refresh machine fields from Forkcast, then rebuild the KV snapshot.
 * Best-effort — any failure logs and leaves the tables on their last good
 * state. The ONLY status change it makes is flipping a known upgrade to `live`
 * when Forkcast marks it Live with a real date (dates slip, so nothing else is
 * auto-locked). New upstream forks are logged, never auto-inserted, so no
 * unvetted upstream blurb ever renders — editorial rows come via a PR.
 */
export async function refreshRoadmap(env: Env): Promise<RoadmapRefreshReport> {
  const report: RoadmapRefreshReport = { fetched: false, wentLive: [], metaUpdated: [], unknownUpstream: [] };
  try {
    const known = (
      await env.DB.prepare('SELECT id, status FROM roadmap_upgrades').all<{ id: string; status: string }>()
    ).results;
    const knownIds = new Map(known.map((r) => [r.id, r.status]));

    const res = await fetch(FORKCAST_URL, { headers: { 'user-agent': 'ethereum-beat-roadmap' } });
    if (res.ok) {
      report.fetched = true;
      const upstream = parseForkcast(await res.text());
      const now = new Date().toISOString();
      for (const u of upstream) {
        if (!knownIds.has(u.id)) {
          if (u.status && u.status !== 'Live') report.unknownUpstream.push(u.id);
          continue;
        }
        // (1) Live transition — the one monotonic, unambiguous signal.
        const iso = parseForkcastDate(u.activationDate);
        if (u.status === 'Live' && iso && knownIds.get(u.id) !== 'live') {
          const label = `${u.activationDate!.replace(/\s*\d{1,2},/, '')} · live`.replace(/\s+/g, ' ').trim();
          await env.DB.prepare(
            `UPDATE roadmap_upgrades
               SET status='live', date_locked=1, activation_date=?2, target_label=?3, updated_at=?4
             WHERE id=?1`,
          ).bind(u.id, iso, label, now).run();
          report.wentLive.push(u.id);
        }
        // (2) Keep the meta thread link current (cheap, never editorial).
        if (u.metaEipLink) {
          await env.DB.prepare('UPDATE roadmap_upgrades SET meta_eip_url=?2, updated_at=?3 WHERE id=?1')
            .bind(u.id, u.metaEipLink, now).run();
          report.metaUpdated.push(u.id);
        }
      }
    }
  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err);
  }

  // rebuild the snapshot from whatever D1 now holds (even if the fetch failed)
  try {
    const snap = await buildRoadmapSnapshot(env.DB);
    await env.SNAP.put(ROADMAP_KEY, JSON.stringify(snap));
  } catch (err) {
    report.error = (report.error ? report.error + '; ' : '') + (err instanceof Error ? err.message : String(err));
  }
  console.log('roadmap refresh', JSON.stringify(report));
  return report;
}
