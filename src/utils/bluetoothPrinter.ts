/**
 * Web Bluetooth API 封装（热敏打印机）
 * P3-4: 蓝牙打印机支持
 *
 * 注意：Web Bluetooth 需要 HTTPS + 用户手势触发
 */

import type { BluetoothPrintOrder } from './escpos'
import { generateEscPosBill } from './escpos'
export type { BluetoothPrintOrder }
export { generateEscPosBill }

// 常见热敏打印机蓝牙服务 UUID
const PRINTER_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb'
const PRINTER_CHARACTERISTIC_UUID = '00002af1-0000-1000-8000-00805f9b34fb'

// 备选 UUID（部分打印机使用标准 Serial Port）
const SERIAL_SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb'
const SERIAL_CHARACTERISTIC_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb'

export interface BluetoothPrinterDevice {
  device: BluetoothDevice
  server: BluetoothRemoteGATTServer
  characteristic: BluetoothRemoteGATTCharacteristic
  name: string
}

export class BluetoothPrinterError extends Error {
  constructor(message: string, public code: string) {
    super(message)
    this.name = 'BluetoothPrinterError'
  }
}

/**
 * 检测当前环境是否支持蓝牙打印
 */
export function isBluetoothPrintSupported(): boolean {
  return !!(
    typeof navigator !== 'undefined' &&
    'bluetooth' in navigator &&
    window.isSecureContext
  )
}

/**
 * 请求用户选择并连接蓝牙打印机
 */
export async function connectBluetoothPrinter(): Promise<BluetoothPrinterDevice> {
  if (!isBluetoothPrintSupported()) {
    throw new BluetoothPrinterError(
      '当前环境不支持蓝牙打印。请使用 Chrome/Edge 浏览器，并确保通过 HTTPS 访问。',
      'NOT_SUPPORTED',
    )
  }

  try {
    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { services: [PRINTER_SERVICE_UUID] },
        { services: [SERIAL_SERVICE_UUID] },
      ],
      optionalServices: [PRINTER_SERVICE_UUID, SERIAL_SERVICE_UUID],
    })

    if (!device.gatt) {
      throw new BluetoothPrinterError('设备不支持 GATT 协议', 'NO_GATT')
    }

    const server = await device.gatt.connect()

    // 尝试主服务 UUID
    let characteristic: BluetoothRemoteGATTCharacteristic | null = null
    let service: BluetoothRemoteGATTService | null = null

    try {
      service = await server.getPrimaryService(PRINTER_SERVICE_UUID)
      characteristic = await service.getCharacteristic(PRINTER_CHARACTERISTIC_UUID)
    } catch {
      // 尝试备选 Serial UUID
      try {
        service = await server.getPrimaryService(SERIAL_SERVICE_UUID)
        characteristic = await service.getCharacteristic(SERIAL_CHARACTERISTIC_UUID)
      } catch {
        throw new BluetoothPrinterError(
          '无法找到打印服务，请确认选择的是一个蓝牙热敏打印机。',
          'SERVICE_NOT_FOUND',
        )
      }
    }

    if (!characteristic) {
      throw new BluetoothPrinterError('无法获取打印特征值', 'CHARACTERISTIC_NOT_FOUND')
    }

    return {
      device,
      server,
      characteristic,
      name: device.name || '未命名打印机',
    }
  } catch (err: unknown) {
    if (err instanceof BluetoothPrinterError) throw err
    if (err instanceof Error && err.name === 'NotFoundError') {
      throw new BluetoothPrinterError('未选择打印机或设备未找到', 'USER_CANCELLED')
    }
    throw new BluetoothPrinterError(
      err instanceof Error ? err.message : '蓝牙连接失败',
      'CONNECTION_FAILED',
    )
  }
}

/**
 * 发送 ESC/POS 数据到打印机
 */
export async function sendToPrinter(
  printer: BluetoothPrinterDevice,
  data: Uint8Array,
): Promise<void> {
  if (!printer.server.connected) {
    throw new BluetoothPrinterError('打印机已断开连接', 'DISCONNECTED')
  }

  // 蓝牙特征值通常有最大写入限制（约 512 bytes），需要分片发送
  const MAX_CHUNK_SIZE = 512
  for (let offset = 0; offset < data.length; offset += MAX_CHUNK_SIZE) {
    const chunk = data.slice(offset, offset + MAX_CHUNK_SIZE)
    await printer.characteristic.writeValue(chunk)
  }
}

/**
 * 一键打印账单（连接 + 发送 + 可选断开）
 */
export async function printBillViaBluetooth(
  order: BluetoothPrintOrder,
  paperWidth: 48 | 32 = 48,
): Promise<BluetoothPrinterDevice> {
  const printer = await connectBluetoothPrinter()
  const escposData = generateEscPosBill(order, paperWidth)
  await sendToPrinter(printer, escposData)
  return printer
}

/**
 * 断开打印机连接
 */
export function disconnectPrinter(printer: BluetoothPrinterDevice | null): void {
  if (printer?.server?.connected) {
    printer.server.disconnect()
  }
}
