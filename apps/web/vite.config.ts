/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// In development, Vite serves the app and forwards API calls to the local server,
// the same way nginx does in Docker.
const apiTarget = 'http://localhost:3000';

export default defineConfig({
  // Shown under Settings → Help → About. npm sets it when a script runs.
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0') },
  plugins: [
    react(),
    tailwindcss(),
    // An installable app: "Add to Home screen" gives an icon and a full-screen
    // window (docs/spec/07-mobile-ui.md, "PWA"). Only the app shell is cached;
    // mail always comes fresh from the server.
    VitePWA({
      registerType: 'autoUpdate',
      // Registered in src/shared/pwa.ts, which also reloads into new versions.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'PhoneMail',
        short_name: 'PhoneMail',
        description: 'Email where your phone number is your address.',
        lang: 'en',
        start_url: '/m',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#008069',
        background_color: '#ffffff',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // Never answer these from the cache: live data, server endpoints, and the
        // Android app's site check (assetlinks.json must be the real file).
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/socket\.io\//,
          /^\/webhooks\//,
          /^\/\.well-known\//,
        ],
        runtimeCaching: [],
      },
    }),
  ],
  build: {
    // Screens are split per route (app/router.tsx). The main file is React, the router,
    // TanStack Query, zod and the three languages: ~180 KB gzipped, so warn only above that.
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': apiTarget,
      '/webhooks': apiTarget,
      '/socket.io': { target: apiTarget, ws: true },
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
