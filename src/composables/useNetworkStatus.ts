import { ref, onMounted, onUnmounted } from 'vue'

const online = ref(navigator.onLine)

export function useNetworkStatus() {
  function onOnline() {
    online.value = true
  }
  function onOffline() {
    online.value = false
  }

  onMounted(() => {
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
  })

  onUnmounted(() => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
  })

  return {
    online,
    isOnline: () => online.value,
  }
}
