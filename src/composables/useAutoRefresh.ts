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

  function start() {
    stop()
    if (interval > 0) {
      timer = setInterval(() => {
        callback()
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

  onMounted(() => {
    if (immediate) {
      start()
    }
  })

  onUnmounted(() => {
    stop()
  })

  return {
    isRunning,
    start,
    stop,
  }
}
