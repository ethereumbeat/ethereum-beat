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
  },
});
