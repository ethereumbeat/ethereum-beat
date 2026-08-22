import { defineMiddleware } from 'astro:middleware';
import { siteOrigin } from './lib/site';
import { markdownFor, notFoundMarkdown, MARKDOWN_PATHS } from './lib/agent-markdown';

/**
 * Astro middleware (auto-loaded; runs through the Cloudflare adapter).
 *
 * §35.B — API discovery: advertise the API catalog (RFC 9727) with an RFC 8288
 * Link header on every response. It survives the Worker's secureHtml() re-wrap
 * and is invisible to audit-csp (which asserts a header allowlist, not a closed set).
 *
 * §35.E / §36.C — Markdown content negotiation: serve a text/markdown rendition
 * when Accept: text/markdown is sent for a content page (now including `/`), and
 * add `Vary: Accept` to the HTML variant of every negotiable path so a CDN can't
 * serve the wrong cached variant (acceptmarkdown.com compliance).
 *
 * §36.A — Agent-friendly 404: a text/markdown recovery body for an unknown path
 * when markdown is requested.
 */
const API_CATALOG_LINK = '</.well-known/api-catalog>; rel="api-catalog"';
const NEGOTIABLE = new Set<string>(MARKDOWN_PATHS);

const mdHeaders = () => ({
  'content-type': 'text/markdown; charset=utf-8',
  'cache-control': 'public, max-age=300',
  vary: 'Accept',
  link: API_CATALOG_LINK,
});

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url, locals } = context;
  const wantsMarkdown = /text\/markdown/i.test(request.headers.get('accept') ?? '');
  const normalized = url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '');

  // Markdown negotiation for known content pages — return before HTML render.
  if (wantsMarkdown) {
    const md = markdownFor(normalized, siteOrigin(locals.runtime.env));
    if (md !== null) return new Response(md, { headers: mdHeaders() });
  }

  const res = await next();

  // Agent-friendly markdown 404 for unknown paths.
  if (res.status === 404 && wantsMarkdown) {
    return new Response(notFoundMarkdown(siteOrigin(locals.runtime.env)), { status: 404, headers: mdHeaders() });
  }

  // The JSON API routes return responses with immutable headers, so clone into
  // a mutable Response before adding headers (appending in place throws
  // "Can't modify immutable headers" and 500s the route).
  const headers = new Headers(res.headers);
  headers.append('Link', API_CATALOG_LINK);
  // acceptmarkdown.com: a negotiable path's HTML variant must advertise
  // Vary: Accept so caches don't serve HTML to a markdown request or vice-versa.
  if (NEGOTIABLE.has(normalized)) {
    const existing = headers.get('Vary');
    headers.set('Vary', existing ? `${existing}, Accept` : 'Accept');
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
});
