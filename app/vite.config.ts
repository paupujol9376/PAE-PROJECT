import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// Static, backend-free PWA (replica/02-architecture/architecture.md).
// Large tile archives are NOT precached: they are downloaded on demand into OPFS
// (src/offline/offline.ts). JSON data uses network-first so the last copy works offline.
export default defineConfig({
  base: process.env.PAE_BASE || '/',
  server: { fs: { allow: ['..'] } },
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'glyphs/**/*.pbf'],
      manifest: {
        name: 'PAE Map: Sri Lanka schools and roads',
        short_name: 'PAE Map',
        description: 'Offline map of schools and roads in Sri Lanka.',
        theme_color: '#0A0E14',
        background_color: '#0A0E14',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,pbf}'],
        globIgnores: ['data/**'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/data\/[^/]+\.json$/.test(url.pathname),
            handler: 'NetworkFirst',
            options: { cacheName: 'pae-data', networkTimeoutSeconds: 6, expiration: { maxEntries: 10 } },
          },
        ],
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as never);
