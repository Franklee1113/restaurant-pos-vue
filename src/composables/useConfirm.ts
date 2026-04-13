import { ref } from 'vue'

export interface ConfirmOptions {
  title?: string
  description?: string
  confirmText?: string
  cancelText?: string
  type?: 'default' | 'danger'
}

const open = ref(false)
const options = ref<ConfirmOptions>({})
let resolveFn: ((value: boolean) => void) | null = null

export function useConfirm() {
  function confirm(opts: ConfirmOptions = {}): Promise<boolean> {
    options.value = opts
    open.value = true
    return new Promise((resolve) => {
      resolveFn = resolve
    })
  }

  function onConfirm() {
    open.value = false
    resolveFn?.(true)
    resolveFn = null
  }

  function onCancel() {
    open.value = false
    resolveFn?.(false)
    resolveFn = null
  }

  return { open, options, confirm, onConfirm, onCancel }
}

export const globalConfirm = useConfirm()
