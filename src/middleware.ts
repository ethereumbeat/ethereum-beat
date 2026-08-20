import { defineMiddleware } from 'astro:middleware';

/**
 * Astro middleware (auto-loaded; runs through the Cloudflare adapter).
 *
 * §35.B — API discovery: advertise the API catalog (RFC 9727, served at
 * /.well-known/api-catalog) with an RFC 8288 Link header on every response. It
 * survives the Worker's secureHtml() re-wrap (which preserves existing headers)
 * and is invisible to audit-csp (which asserts a specific header allowlist, not a
 * closed set).
 */
const API_CATALOG_LINK = '</.well-known/api-catalog>; rel="api-catalog"';

export const onRequest = defineMiddleware(async (_context, next) => {
  const res = await next();
  // The JSON API routes return responses with immutable headers, so clone into
  // a mutable Response before adding the Link header (appending in place throws
  // "Can't modify immutable headers" and 500s the route).
  const headers = new Headers(res.headers);
  headers.append('Link', API_CATALOG_LINK);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
});
