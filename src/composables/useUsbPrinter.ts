import { ref } from 'vue'
import {
  connectUsbPrinter,
  disconnectUsbPrinter,
  sendToUsbPrinter,
  generateEscPosBill,
  isUsbPrintSupported,
  type BluetoothPrintOrder,
  UsbPrinterError,
  type UsbPrinterDevice,
} from '@/utils/usbPrinter'

export { isUsbPrintSupported, UsbPrinterError, type UsbPrinterDevice }

const connectedUsbPrinter = ref<UsbPrinterDevice | null>(null)
const isUsbConnecting = ref(false)
const lastUsbError = ref('')

export function useUsbPrinter() {
  async function connect(showAllDevices = false): Promise<boolean> {
    if (connectedUsbPrinter.value?.device?.opened) return true

    isUsbConnecting.value = true
    lastUsbError.value = ''
    try {
      connectedUsbPrinter.value = await connectUsbPrinter(showAllDevices)
      return true
    } catch (err: unknown) {
      if (err instanceof UsbPrinterError) {
        lastUsbError.value = err.message
      } else {
        lastUsbError.value = err instanceof Error ? err.message : 'USB 连接失败'
      }
      return false
    } finally {
      isUsbConnecting.value = false
    }
  }

  async function print(order: BluetoothPrintOrder, paperWidth: 48 | 32 = 48): Promise<boolean> {
    lastUsbError.value = ''
    try {
      if (!connectedUsbPrinter.value?.device?.opened) {
        const ok = await connect()
        if (!ok) return false
      }
      const data = generateEscPosBill(order, paperWidth)
      await sendToUsbPrinter(connectedUsbPrinter.value!, data)
      return true
    } catch (err: unknown) {
      if (err instanceof UsbPrinterError) {
        lastUsbError.value = err.message
      } else {
        lastUsbError.value = err instanceof Error ? err.message : '打印失败'
      }
      // 打印失败后重置连接
      if (connectedUsbPrinter.value) {
        disconnectUsbPrinter(connectedUsbPrinter.value)
        connectedUsbPrinter.value = null
      }
      return false
    }
  }

  function disconnect(): void {
    disconnectUsbPrinter(connectedUsbPrinter.value)
    connectedUsbPrinter.value = null
    lastUsbError.value = ''
  }

  return {
    connectedPrinter: connectedUsbPrinter,
    isConnecting: isUsbConnecting,
    lastError: lastUsbError,
    isSupported: isUsbPrintSupported,
    connect,
    print,
    disconnect,
  }
}
