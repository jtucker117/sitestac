import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

import cloudflare from "@astrojs/cloudflare";

// Static site -> deploys to Cloudflare Pages with build cmd `astro build`, output dir `dist`.
export default defineConfig({
  site: 'https://sitestac.com',
  vite: { plugins: [tailwindcss()] },
  adapter: cloudflare()
});