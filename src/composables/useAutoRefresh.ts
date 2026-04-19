import { onMounted, onUnmounted, ref } from 'vue'

export interface UseAutoRefreshOptions {
  interval?: number
  immediate?: boolean
}

export function useAutoRefresh(
  callback: () => void | Promise<void>,
  options: UseAutoRefreshOptions = {},
) {
  const { interval = 30000, immediate = true } = options
  let timer: ReturnType<typeof setInterval> | null = null
  const isRunning = ref(false)
  let isVisible = true

  function tick() {
    if (isVisible) {
      callback()
    }
  }

  function start() {
    stop()
    if (interval > 0) {
      timer = setInterval(() => {
        tick()
      }, interval)
      isRunning.value = true
    }
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    isRunning.value = false
  }

  function onVisibilityChange() {
    isVisible = !document.hidden
    // 从隐藏恢复时立即执行一次，确保数据最新
    if (isVisible && isRunning.value) {
      callback()
    }
  }

  onMounted(() => {
    if (immediate) {
      start()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onUnmounted(() => {
    stop()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  return {
    isRunning,
    start,
    stop,
  }
}
