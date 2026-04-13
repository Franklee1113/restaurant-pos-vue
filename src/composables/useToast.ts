import { ref } from 'vue'

export interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
}

const toasts = ref<ToastItem[]>([])

export function useToast() {
  function show(message: string, type: ToastItem['type'] = 'info', duration = 3000) {
    const id = Date.now() + Math.random()
    toasts.value.push({ id, message, type })
    if (duration > 0) {
      setTimeout(() => {
        remove(id)
      }, duration)
    }
  }

  function success(message: string, duration = 3000) {
    show(message, 'success', duration)
  }

  function error(message: string, duration = 4000) {
    show(message, 'error', duration)
  }

  function warning(message: string, duration = 3000) {
    show(message, 'warning', duration)
  }

  function info(message: string, duration = 3000) {
    show(message, 'info', duration)
  }

  function remove(id: number) {
    const idx = toasts.value.findIndex((t) => t.id === id)
    if (idx > -1) toasts.value.splice(idx, 1)
  }

  return { toasts, show, success, error, warning, info, remove }
}
