import { ref } from 'vue'
import {
  connectBluetoothPrinter,
  disconnectPrinter,
  sendToPrinter,
  printBillViaBluetooth,
  isBluetoothPrintSupported,
  generateEscPosBill,
  type BluetoothPrinterDevice,
  type BluetoothPrintOrder,
  BluetoothPrinterError,
} from '@/utils/bluetoothPrinter'

export { isBluetoothPrintSupported, BluetoothPrinterError, type BluetoothPrintOrder }

const connectedPrinter = ref<BluetoothPrinterDevice | null>(null)
const isConnecting = ref(false)
const lastError = ref('')

export function useBluetoothPrinter() {
  async function connect(): Promise<boolean> {
    if (connectedPrinter.value?.server.connected) return true

    isConnecting.value = true
    lastError.value = ''
    try {
      connectedPrinter.value = await connectBluetoothPrinter()
      return true
    } catch (err: unknown) {
      if (err instanceof BluetoothPrinterError) {
        lastError.value = err.message
      } else {
        lastError.value = err instanceof Error ? err.message : '蓝牙连接失败'
      }
      return false
    } finally {
      isConnecting.value = false
    }
  }

  async function print(order: BluetoothPrintOrder, paperWidth: 48 | 32 = 48): Promise<boolean> {
    lastError.value = ''
    try {
      // 如果已连接，直接发送；否则先连接
      if (!connectedPrinter.value?.server.connected) {
        const ok = await connect()
        if (!ok) return false
      }
      const data = generateEscPosBill(order, paperWidth)
      await sendToPrinter(connectedPrinter.value!, data)
      return true
    } catch (err: unknown) {
      if (err instanceof BluetoothPrinterError) {
        lastError.value = err.message
      } else {
        lastError.value = err instanceof Error ? err.message : '打印失败'
      }
      // 打印失败后重置连接，下次重新配对
      if (connectedPrinter.value) {
        disconnectPrinter(connectedPrinter.value)
        connectedPrinter.value = null
      }
      return false
    }
  }

  function disconnect(): void {
    disconnectPrinter(connectedPrinter.value)
    connectedPrinter.value = null
    lastError.value = ''
  }

  return {
    connectedPrinter,
    isConnecting,
    lastError,
    isSupported: isBluetoothPrintSupported,
    connect,
    print,
    disconnect,
  }
}
