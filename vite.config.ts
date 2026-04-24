import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '/api/public': {
        target: process.env.VITE_API_PUBLIC_URL || 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/api': {
        target: process.env.VITE_API_URL || 'http://127.0.0.1:8090',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/echarts')) {
            return 'vendor-echarts'
          }
          if (id.includes('node_modules/@e965/xlsx') || id.includes('node_modules/xlsx')) {
            return 'vendor-xlsx'
          }
        },
      },
    },
  },
})
