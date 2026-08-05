/**
 * RFC 9116 security.txt at /.well-known/security.txt (text/plain).
 *
 * Contact is the single-mailbox subaddress beat+security@ethereumbeat.org
 * (routes to the one live beat@ box; see SECURITY.md and DECISIONS.md). Expires
 * is computed per request as now + 350 days, so it can never silently go stale —
 * even if the project sits un-deployed for a year, a fresh request always emits
 * a value well under RFC 9116's one-year ceiling. The route is SSR (never
 * prerendered) so Date.now() runs at request time; Cache-Control caps the reuse
 * of any one computed value at a day.
 */
import type { APIRoute } from 'astro';
import { siteOrigin } from '../../lib/site';

export const prerender = false;

const DAY_MS = 86_400_000;

export const GET: APIRoute = ({ locals }) => {
  const origin = siteOrigin(locals.runtime.env);
  const expires = new Date(Date.now() + 350 * DAY_MS).toISOString();
  const body = [
    'Contact: mailto:beat+security@ethereumbeat.org',
    `Expires: ${expires}`,
    'Preferred-Languages: en',
    `Canonical: ${origin}/.well-known/security.txt`,
    'Policy: https://github.com/ethereumbeat/ethereum-beat/blob/main/SECURITY.md',
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=86400',
    },
  });
};
