import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import * as Sentry from '@sentry/vue'

import App from './App.vue'
import router from './router'

const app = createApp(App)

// P3-1: 注册 Service Worker（PWA 离线支持）
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered:', registration.scope)
      })
      .catch((err) => {
        console.warn('SW registration failed:', err)
      })
  })
}

// P1-36: Sentry 前端监控（需在 .env 中配置 VITE_SENTRY_DSN）
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN
if (SENTRY_DSN) {
  Sentry.init({
    app,
    dsn: SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    release: import.meta.env.VITE_APP_VERSION || 'dev',
    environment: import.meta.env.MODE,
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 0.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event) {
      // 过滤掉本地开发环境的错误
      if (import.meta.env.DEV) return null
      return event
    },
  })
}

app.use(createPinia())
app.use(router)

app.config.errorHandler = (err, instance, info) => {
  console.error('[Global Error Handler]', err, instance, info)
  if (SENTRY_DSN && import.meta.env.PROD) {
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
      extra: { componentInfo: info },
    })
  }
}

app.mount('#app')
