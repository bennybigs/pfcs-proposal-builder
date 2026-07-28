import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

// Tailwind/PostCSS configs are resolved with absolute paths so the dev server
// works even when launched from a parent directory (workspace root).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'logo.jpg'],
      manifest: {
        name: 'PFCS Proposal Builder',
        short_name: 'PFCS Proposals',
        description:
          'Build, share, and export Post-Frame Construction Solutions customer proposals.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#F5F5F5',
        theme_color: '#E8930C',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,ico,woff,woff2}'],
        // Proposals are large; the main bundle exceeds the 2 MiB default.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Serve index.html for client-side routes offline, but never shadow
        // the serverless signing endpoint.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Google Fonts stylesheets — keeps brand type offline after first load.
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            // The font files themselves.
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Signing must always hit the network — never serve a stale result.
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  css: {
    postcss: {
      plugins: [
        tailwindcss({ config: path.resolve(__dirname, 'tailwind.config.js') }),
        autoprefixer(),
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
