/**
 * Worker entry: wraps the Astro-built handler so the same Worker also serves
 * the daily cron trigger. `astro build` must run before wrangler dev/deploy.
 */
// @ts-ignore — built by `astro build`, no type declarations
import astro from '../dist/_worker.js/index.js';
import { runCollector } from './collector.ts';

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // behind a flag until DNS is live: workers.dev → canonical host, 301
    if (env.REDIRECT_TO_CANONICAL === 'true') {
      const url = new URL(request.url);
      if (url.hostname.endsWith('.workers.dev')) {
        url.hostname = env.CANONICAL_HOST || 'ethereumbeat.org';
        url.port = '';
        return Response.redirect(url.toString(), 301);
      }
    }
    return astro.fetch(request, env, ctx);
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runCollector(env));
  },
} satisfies ExportedHandler<Env>;
