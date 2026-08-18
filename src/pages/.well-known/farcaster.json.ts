/**
 * Farcaster Mini App manifest at /.well-known/farcaster.json (spec §33.D).
 *
 * The `frame` block advertises the app (name, icon, home, splash). The
 * `accountAssociation` — the signed { header, payload, signature } that binds
 * this domain to the maintainer's Farcaster FID — is READ from the
 * FARCASTER_ACCOUNT_ASSOCIATION secret and parsed in. It is NEVER fabricated:
 * the maintainer signs the domain with their custody key (via the Farcaster
 * developer tools) and injects the value as a Worker secret. Absent → the
 * manifest serves without it (valid, but the app stays unverified).
 */
import type { APIRoute } from 'astro';
import { siteOrigin, SITE_NAME } from '../../lib/site';

export const prerender = false;

/** parse the maintainer-signed accountAssociation JSON, or null if unset/invalid */
function accountAssociation(raw?: string): unknown {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (obj && obj.header && obj.payload && obj.signature) return obj;
    console.warn('[farcaster.json] FARCASTER_ACCOUNT_ASSOCIATION set but missing header/payload/signature');
  } catch {
    console.warn('[farcaster.json] FARCASTER_ACCOUNT_ASSOCIATION is not valid JSON — serving manifest without it');
  }
  return null;
}

export const GET: APIRoute = ({ locals }) => {
  const env = locals.runtime.env;
  const origin = siteOrigin(env);
  const assoc = accountAssociation(env.FARCASTER_ACCOUNT_ASSOCIATION);

  const manifest = {
    ...(assoc ? { accountAssociation: assoc } : {}),
    frame: {
      version: '1',
      name: SITE_NAME,
      iconUrl: `${origin}/icon.png`,
      homeUrl: `${origin}/`,
      splashImageUrl: `${origin}/splash.png`,
      splashBackgroundColor: '#fbfbf9',
    },
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=86400',
    },
  });
};
