import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The dev server forwards /api calls to the Express server, so the browser
// only talks to one origin (no CORS issues, works from a phone on the LAN too).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'VieMeal - AI Meal Planner',
        short_name: 'VieMeal',
        description: 'Track meals, hit your nutrition targets and get meal plans.',
        theme_color: '#16a34a',
        background_color: '#f7faf7',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Offline shell: the app files are cached; API calls always go to the network.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [],
      },
    }),
  ],
  build: {
    rollupOptions: {
      // Put big libraries in their own files so the browser can cache them separately.
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
        },
      },
    },
  },
  server: {
    port: 5174,
    proxy: { '/api': 'http://localhost:4100' },
  },
  preview: {
    port: 5174,
    proxy: { '/api': 'http://localhost:4100' },
  },
});
