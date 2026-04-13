import { ref } from 'vue'

const globalLoading = ref(false)
const globalLoadingText = ref('')

let counter = 0

export function useGlobalLoading() {
  function show(text = '加载中...') {
    counter++
    globalLoadingText.value = text
    globalLoading.value = true
  }

  function hide() {
    counter = Math.max(0, counter - 1)
    if (counter === 0) {
      globalLoading.value = false
      globalLoadingText.value = ''
    }
  }

  return {
    visible: globalLoading,
    text: globalLoadingText,
    show,
    hide,
  }
}
