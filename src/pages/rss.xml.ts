import type { APIRoute } from 'astro';
import { edgeCached } from '../lib/edge-cache';
import { siteOrigin } from '../lib/site';
import { buildSnapshot, SNAPSHOT_KEY, type Snapshot } from '../../worker/snapshot.ts';
import { buildDigest } from '../../worker/broadcast/digest.ts';

export const prerender = false;

/**
 * /rss.xml (spec §28.B) — a public RSS 2.0 feed of Ethereum's protocol health.
 * Items derive from the SAME source the daily social broadcast uses: the daily
 * channel digest (buildDigest, worker/broadcast/digest.ts) plus roadmap status
 * flips (roadmap_upgrades). Non-financial only — no price / TVL / market
 * framing. Built from snapshot:latest / D1 at request time; zero paid services.
 * Data-derived items carry the growthepie CC BY 4.0 attribution. NOT in the
 * sitemap — audit-meta crawls the sitemap and would run HTML checks on it.
 */

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** RFC-822 date for pubDate, from an ISO string (or now). */
const rfc822 = (iso?: string | null) => {
  const d = iso ? new Date(iso) : new Date();
  return (Number.isNaN(d.getTime()) ? new Date() : d).toUTCString();
};

const STATUS_LABEL: Record<string, string> = {
  live: 'live',
  scheduled: 'scheduled',
  testnet: 'on testnet',
  devnet: 'in devnet',
  planning: 'in planning',
  research: 'research',
  next: 'next up',
};

interface UpgradeRow {
  id: string;
  name: string;
  status: string;
  category: string | null;
  target_label: string | null;
  summary: string | null;
  significance: string | null;
  source_url: string | null;
  activation_date: string | null;
  updated_at: string | null;
}

interface Item {
  title: string;
  link: string;
  guid: string;
  pubDate: string;
  description: string;
}

export const GET: APIRoute = (ctx) =>
  edgeCached(ctx, async () => {
    const { DB, SNAP } = ctx.locals.runtime.env;
    const origin = siteOrigin(ctx.locals.runtime.env);

    // snapshot:latest → the daily digest, self-healing from D1 like /api/snapshot
    let snap: Snapshot;
    try {
      const body = await SNAP.get(SNAPSHOT_KEY);
      snap = body ? (JSON.parse(body) as Snapshot) : await buildSnapshot(DB);
    } catch {
      snap = await buildSnapshot(DB);
    }

    const items: Item[] = [];

    // 1) the daily vitals digest — the same body the broadcast posts
    const digest = buildDigest(snap, origin);
    items.push({
      title: `Ethereum's vitals · ${digest.date}`,
      link: origin,
      guid: `${origin}/#vitals-${digest.date}`,
      pubDate: rfc822(snap.generated_at),
      description:
        `${digest.text}\n\nData: multiple open sources including growthepie (CC BY 4.0). ` +
        `Live values update every 12-second slot.`,
    });

    // 2) roadmap status — one item per upgrade; the guid folds in the status so a
    //    devnet→live flip surfaces as a fresh item (the "status flip" source)
    let upgrades: UpgradeRow[] = [];
    try {
      upgrades = (
        await DB.prepare(
          `SELECT id, name, status, category, target_label, summary, significance,
                  source_url, activation_date, updated_at
             FROM roadmap_upgrades ORDER BY sort`,
        ).all<UpgradeRow>()
      ).results;
    } catch {
      upgrades = [];
    }
    for (const u of upgrades) {
      const state = STATUS_LABEL[u.status] ?? u.status;
      const where = u.target_label ? ` (${u.target_label})` : '';
      const body = [u.summary, u.significance].filter(Boolean).join(' ');
      items.push({
        title: `Roadmap · ${u.name} — ${state}${where}`,
        link: `${origin}/roadmap`,
        guid: `${origin}/roadmap#${u.id}-${u.status}`,
        pubDate: rfc822(u.updated_at ?? u.activation_date ?? snap.generated_at),
        description: body || `${u.name} is ${state}. Roadmap from forkcast.`,
      });
    }

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
      '  <channel>',
      '    <title>Ethereum Beat — protocol health</title>',
      `    <link>${origin}</link>`,
      '    <description>Ethereum&apos;s protocol health, one beat per 12-second slot: censorship resistance, decentralisation, node sustainability and privacy. A heartbeat, not a ticker — no price or market framing.</description>',
      '    <language>en</language>',
      `    <lastBuildDate>${rfc822(snap.generated_at)}</lastBuildDate>`,
      `    <atom:link href="${origin}/rss.xml" rel="self" type="application/rss+xml" />`,
      ...items.map((it) =>
        [
          '    <item>',
          `      <title>${esc(it.title)}</title>`,
          `      <link>${it.link}</link>`,
          `      <guid isPermaLink="false">${esc(it.guid)}</guid>`,
          `      <pubDate>${it.pubDate}</pubDate>`,
          `      <description>${esc(it.description)}</description>`,
          '    </item>',
        ].join('\n'),
      ),
      '  </channel>',
      '</rss>',
      '',
    ].join('\n');

    return new Response(xml, {
      headers: {
        'content-type': 'application/rss+xml; charset=utf-8',
        'cache-control': 'public, s-maxage=3600, max-age=300',
      },
    });
  });
