/**
 * Collector run bookkeeping + failure alerting.
 *
 * - Every run writes one `collector_runs` row (started/finished, per-source
 *   ok/fail, error summary) — the audit trail and the staleness source.
 * - On any source failure, ONE digest alert is sent for the whole run (not one
 *   per source), de-duped to at most one per 24h via D1.
 * - The email path is fully fork-safe: `env.SEND_EMAIL` is absent on free-tier
 *   forks (the binding is injected only into the maintainer's deploy config), so
 *   every use is guarded — unbound means log-and-skip, and a send failure is
 *   caught, never thrown. A failing alert must never break the collector.
 */
import type { CollectReport } from './collector.ts';

/** Data older than this (since the last successful collector run) is stale. */
export const STALE_THRESHOLD_MS = 26 * 3_600_000; // 26h

function summarise(report: CollectReport): string | null {
  if (report.failed.length === 0) return null;
  return report.failed
    .map((f) => `${f.source}: ${f.error}`)
    .join(' | ')
    .slice(0, 500);
}

/** Persist one collector_runs row. Never throws (a logging failure must not
 *  fail the run); returns false if the write failed. */
export async function recordRun(
  env: Env,
  report: CollectReport,
  startedAt: string,
  finishedAt: string,
  alerted: boolean,
): Promise<boolean> {
  try {
    await env.DB.prepare(
      `INSERT INTO collector_runs (started_at, finished_at, ok, failed, error_summary, rows, alerted)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
      .bind(
        startedAt,
        finishedAt,
        JSON.stringify(report.ok),
        JSON.stringify(report.failed),
        summarise(report),
        report.rows,
        alerted ? 1 : 0,
      )
      .run();
    return true;
  } catch (err) {
    console.error('collector_runs insert failed', err);
    return false;
  }
}

/** True if a failure digest was already alerted within the last 24h. On a query
 *  error, returns true (fail safe — better to miss one alert than to spam). */
async function alertedRecently(env: Env): Promise<boolean> {
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM collector_runs
       WHERE alerted = 1 AND finished_at > datetime('now', '-24 hours')`,
    ).first<{ n: number }>();
    return (row?.n ?? 0) > 0;
  } catch (err) {
    console.error('alert de-dupe query failed; suppressing to avoid spam', err);
    return true;
  }
}

function digestBody(report: CollectReport, finishedAt: string): string {
  return [
    `Ethereum Beat daily collector finished ${finishedAt} with ${report.failed.length} failing source(s).`,
    '',
    `OK (${report.ok.length}): ${report.ok.join(', ') || '(none)'}`,
    `FAILED (${report.failed.length}):`,
    ...report.failed.map((f) => `  - ${f.source}: ${f.error}`),
    '',
    `Rows upserted this run: ${report.rows}`,
    '',
    'This is a single digest for the whole run; further alerts are suppressed for 24h.',
  ].join('\r\n');
}

/**
 * Send at most ONE failure digest per run, de-duped to one per 24h. Returns
 * whether an alert was actually sent (so the run row records it). Never throws.
 */
export async function maybeAlert(env: Env, report: CollectReport, finishedAt: string): Promise<boolean> {
  if (report.failed.length === 0) return false; // nothing failed
  if (await alertedRecently(env)) {
    console.log('collector alert suppressed (one already sent within 24h)');
    return false;
  }
  if (!env.SEND_EMAIL) {
    console.warn('SEND_EMAIL binding absent — skipping collector alert (fork/free-tier)');
    return false;
  }
  const to = env.ALERT_EMAIL_TO || 'beat@ethereumbeat.org';
  const from = env.ALERT_EMAIL_FROM || 'alerts@ethereumbeat.org';
  try {
    const { EmailMessage } = await import('cloudflare:email');
    const raw = [
      `From: Ethereum Beat <${from}>`,
      `To: <${to}>`,
      `Subject: [ethereum-beat] collector: ${report.failed.length} source(s) failed`,
      `Message-ID: <${crypto.randomUUID()}@ethereumbeat.org>`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      digestBody(report, finishedAt),
    ].join('\r\n');
    await env.SEND_EMAIL.send(new EmailMessage(from, to, raw));
    console.log(`collector digest alert sent to ${to}`);
    return true;
  } catch (err) {
    // unverified sender/destination, Email Routing off, transient failure — all
    // non-fatal; the collector's data work already succeeded.
    console.error('collector alert send failed (non-fatal, skipping)', err);
    return false;
  }
}
