import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa'; // WP10

export default defineConfig({
  base: './',
  plugins: [
    // ===== WP10: PWA BLOCK START (vite-plugin-pwa config goes here) =====
    {
      // Link the static manifest (public/manifest.webmanifest) and icons from index.html.
      name: 'mq-pwa-head',
      transformIndexHtml() {
        return [
          { tag: 'link', attrs: { rel: 'manifest', href: './manifest.webmanifest' }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'icon', type: 'image/svg+xml', href: './icons/icon.svg' }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'apple-touch-icon', href: './icons/icon-192.png' }, injectTo: 'head' },
        ];
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      manifest: false, // static manifest lives in public/
      includeAssets: ['icons/*', 'manifest.webmanifest'],
      workbox: {
        // Precache everything built, including lazily imported question-bank chunks.
        globPatterns: ['**/*.{js,css,html,json,svg,png,webmanifest,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: { enabled: false },
    }),
    // ===== WP10: PWA BLOCK END =====
  ],
});
