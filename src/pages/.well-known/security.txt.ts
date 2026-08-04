/**
 * RFC 9116 security.txt at /.well-known/security.txt (text/plain).
 *
 * Contact is the single-mailbox subaddress beat+security@ethereumbeat.org
 * (routes to the one live beat@ box; see SECURITY.md and DECISIONS.md). Expires
 * is generated from the build stamp (__BUILD_TIME__, injected in astro.config)
 * plus 350 days — never hardcoded, so every redeploy refreshes it well under
 * the one-year ceiling RFC 9116 requires.
 */
import type { APIRoute } from 'astro';
import { siteOrigin } from '../../lib/site';

export const prerender = false;

declare const __BUILD_TIME__: string;

const DAY_MS = 86_400_000;
const EXPIRES = new Date(Date.parse(__BUILD_TIME__) + 350 * DAY_MS).toISOString();

export const GET: APIRoute = ({ locals }) => {
  const origin = siteOrigin(locals.runtime.env);
  const body = [
    'Contact: mailto:beat+security@ethereumbeat.org',
    `Expires: ${EXPIRES}`,
    'Preferred-Languages: en',
    `Canonical: ${origin}/.well-known/security.txt`,
    'Policy: https://github.com/ethereumbeat/ethereum-beat/blob/main/SECURITY.md',
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      // matches the API routes' edge-cache posture; the content only changes
      // on redeploy (Expires) or host config (Canonical)
      'cache-control': 'public, max-age=3600',
    },
  });
};
