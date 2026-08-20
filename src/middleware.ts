import { defineMiddleware } from 'astro:middleware';
import { siteOrigin } from './lib/site';
import { markdownFor } from './lib/agent-markdown';

/**
 * Astro middleware (auto-loaded; runs through the Cloudflare adapter).
 *
 * §35.B — API discovery: advertise the API catalog (RFC 9727, served at
 * /.well-known/api-catalog) with an RFC 8288 Link header on every response. It
 * survives the Worker's secureHtml() re-wrap (which preserves existing headers)
 * and is invisible to audit-csp (which asserts a specific header allowlist, not a
 * closed set).
 *
 * §35.E — Markdown content negotiation: for the content pages, serve a
 * text/markdown rendition (Vary: Accept) when the client sends
 * `Accept: text/markdown`, generated from the same shared module as the
 * build-time static .md files.
 */
const API_CATALOG_LINK = '</.well-known/api-catalog>; rel="api-catalog"';

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url, locals } = context;

  // Markdown negotiation — return before rendering the HTML page if asked.
  if (/text\/markdown/i.test(request.headers.get('accept') ?? '')) {
    const md = markdownFor(url.pathname, siteOrigin(locals.runtime.env));
    if (md !== null) {
      return new Response(md, {
        headers: {
          'content-type': 'text/markdown; charset=utf-8',
          'cache-control': 'public, max-age=300',
          vary: 'Accept',
          link: API_CATALOG_LINK,
        },
      });
    }
  }

  const res = await next();
  // The JSON API routes return responses with immutable headers, so clone into
  // a mutable Response before adding the Link header (appending in place throws
  // "Can't modify immutable headers" and 500s the route).
  const headers = new Headers(res.headers);
  headers.append('Link', API_CATALOG_LINK);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
});
