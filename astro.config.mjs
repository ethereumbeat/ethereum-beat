// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: { enabled: true },
    imageService: 'compile',
  }),
  integrations: [react()],
  // sessions are unused; a memory driver stops the adapter auto-configuring
  // a SESSION KV binding (and the build notice about it)
  session: { driver: 'memory' },
  vite: {
    plugins: [tailwindcss()],
    // build-time stamp: security.txt derives its Expires from this (build date
    // + 350 days) so a redeploy always refreshes it and it is never hardcoded.
    define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  },
});
