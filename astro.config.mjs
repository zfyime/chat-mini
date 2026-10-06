import { defineConfig } from 'astro/config'
import { fileURLToPath } from 'node:url'
import unocss from '@unocss/astro'
import solidJs from '@astrojs/solid-js'

import node from '@astrojs/node'
import AstroPWA from '@vite-pwa/astro'
import vercel from '@astrojs/vercel'

const envAdapter = () => {
  switch (process.env.OUTPUT) {
    // Hobby 计划 function 墙钟上限 60s（默认仅 10s，思考型模型流式极易被强杀，表现为只有思考没有正文）
    case 'vercel': return vercel({ maxDuration: 60 })
    default: return node({ mode: 'standalone' })
  }
}

// https://astro.build/config
export default defineConfig({
  integrations: [
    unocss(),
    solidJs(),
    AstroPWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      // SSR 模式没有静态 index.html 可预缓存，必须禁用导航回退，
      // 否则 SW 拦截导航请求时找不到 precache 的 "/"，导致页面空白（non-precached-url 错误）
      workbox: {
        navigateFallback: null,
      },
      manifest: {
        name: 'Chat Mini',
        short_name: 'Chat Mini',
        description: '一个简单的智能聊天机器人。',
        theme_color: '#212129',
        background_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon.svg',
            sizes: '32x32',
            type: 'image/svg',
            purpose: 'any maskable',
          },
        ],
      },
      client: {
        installPrompt: true,
        periodicSyncForUpdates: 20,
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  output: 'server',
  adapter: envAdapter(),
  vite: {
    server: {
      allowedHosts: ['chat.local', 'chat.ferris.cc'],
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  },
})
