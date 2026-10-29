import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages 部署在 /lexiglass/ 子路径下；其他平台可用 BASE=/ 覆盖
const base = process.env.BASE ?? '/lexiglass/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'LexiGlass 背单词',
        short_name: 'LexiGlass',
        description: '基于 FSRS 记忆算法的背单词应用',
        lang: 'zh-CN',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f2f2f7',
        theme_color: '#f2f2f7',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}', 'data/books/index.json'],
        navigateFallback: `${base}index.html`,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/data/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'lexiglass-data', expiration: { maxEntries: 60 } },
          },
        ],
      },
    }),
  ],
})
