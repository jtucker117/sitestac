import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Static site -> deploys to Cloudflare Pages with build cmd `astro build`, output dir `dist`.
export default defineConfig({
  site: 'https://sitestac.com',
  vite: { plugins: [tailwindcss()] },
});
