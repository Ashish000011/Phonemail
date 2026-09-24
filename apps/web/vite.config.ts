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
      injectRegister: 'script-defer',
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
        // Never answer these from the cache: they're live data and server endpoints.
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//, /^\/webhooks\//],
        runtimeCaching: [],
      },
    }),
  ],
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
