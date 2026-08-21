import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Static site -> deploys to Cloudflare Pages with build cmd `astro build`, output dir `dist`.
export default defineConfig({
  site: 'https://sitestac.com',
  integrations: [sitemap()],
  vite: { plugins: [tailwindcss()] },
});
