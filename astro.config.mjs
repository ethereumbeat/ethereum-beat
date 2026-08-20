// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { writeFile } from 'node:fs/promises';
import { markdownFor, MARKDOWN_PATHS } from './src/lib/agent-markdown.ts';
import { siteOrigin } from './src/lib/site.ts';

/**
 * Emit static markdown renditions of the content pages (spec §35.E) alongside
 * the HTML build, from the SAME generator the middleware serves — so `/<page>.md`
 * resolves directly AND Accept: text/markdown negotiation return identical bytes.
 */
const emitAgentMarkdown = {
  name: 'emit-agent-markdown',
  hooks: {
    'astro:build:done': async ({ dir, logger }) => {
      const origin = siteOrigin();
      let n = 0;
      for (const path of MARKDOWN_PATHS) {
        const md = markdownFor(path, origin);
        if (md === null) continue;
        await writeFile(new URL(`${path.replace(/^\//, '')}.md`, dir), md, 'utf8');
        n++;
      }
      logger.info(`emitted ${n} agent markdown renditions`);
    },
  },
};

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: { enabled: true },
    imageService: 'compile',
  }),
  integrations: [react(), emitAgentMarkdown],
  // sessions are unused; a memory driver stops the adapter auto-configuring
  // a SESSION KV binding (and the build notice about it)
  session: { driver: 'memory' },
  vite: {
    plugins: [tailwindcss()],
  },
});
