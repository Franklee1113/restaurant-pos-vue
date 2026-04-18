import { onUnmounted } from 'vue'

export function useDebounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay = 400,
) {
  let timer: ReturnType<typeof setTimeout> | null = null

  function debouncedFn(...args: Parameters<T>) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn(...args)
    }, delay)
  }

  function cancel() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  onUnmounted(() => {
    cancel()
  })

  return {
    debouncedFn,
    cancel,
  }
}
