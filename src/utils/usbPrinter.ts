/**
 * Web USB API 封装（USB 热敏/标签打印机）
 * P3-5: USB 打印机支持
 *
 * 注意：Web USB 需要 HTTPS + 用户手势触发（同 Web Bluetooth）
 */

import { generateEscPosBill, type BluetoothPrintOrder } from './escpos'
export { generateEscPosBill, type BluetoothPrintOrder }

// 常见热敏/标签打印机 Vendor ID（用于预过滤设备列表）
const COMMON_PRINTER_VIDS = [
  0x04b8, // EPSON
  0x0416, // Xprinter / 芯烨
  0x6868, // GPrinter / 佳博
  0x0a5f, // Zebra
  0x04f9, // Brother
  0x0922, // Dymo
]

export interface UsbPrinterDevice {
  device: USBDevice
  ifaceNumber: number
  endpointNumber: number
  name: string
}

export class UsbPrinterError extends Error {
  constructor(message: string, public code: string) {
    super(message)
    this.name = 'UsbPrinterError'
  }
}

/**
 * 检测当前环境是否支持 Web USB
 */
export function isUsbPrintSupported(): boolean {
  return !!(
    typeof navigator !== 'undefined' &&
    'usb' in navigator &&
    window.isSecureContext
  )
}

/**
 * 在 USB 配置中查找打印端点
 * 优先匹配 printer class (0x07) 或 vendor-specific (0xFF)
 */
function findPrinterEndpoint(config: USBConfiguration): { ifaceNumber: number; endpointNumber: number } | null {
  for (const iface of config.interfaces) {
    const alt = iface.alternate
    const isPrinterClass = alt.interfaceClass === 0x07 || alt.interfaceClass === 0xFF
    const outEp = alt.endpoints.find((ep) => ep.direction === 'out')
    if (isPrinterClass && outEp) {
      return { ifaceNumber: iface.interfaceNumber, endpointNumber: outEp.endpointNumber }
    }
  }
  return null
}

/**
 * 兜底策略：找任意有 OUT 端点的接口
 */
function findAnyOutEndpoint(config: USBConfiguration): { ifaceNumber: number; endpointNumber: number } | null {
  for (const iface of config.interfaces) {
    const outEp = iface.alternate.endpoints.find((ep) => ep.direction === 'out')
    if (outEp) {
      return { ifaceNumber: iface.interfaceNumber, endpointNumber: outEp.endpointNumber }
    }
  }
  return null
}

/**
 * 请求用户选择并连接 USB 打印机
 * @param showAllDevices 如果为 true，不过滤 VID，显示所有 USB 设备
 */
export async function connectUsbPrinter(showAllDevices = false): Promise<UsbPrinterDevice> {
  if (!isUsbPrintSupported()) {
    throw new UsbPrinterError(
      '当前环境不支持 USB 打印。请使用 Chrome/Edge 浏览器，并确保通过 HTTPS 访问。',
      'NOT_SUPPORTED',
    )
  }

  try {
    const filters = showAllDevices
      ? []
      : COMMON_PRINTER_VIDS.map((vendorId) => ({ vendorId }))

    const device = await navigator.usb.requestDevice({ filters })

    await device.open()

    // 选择第一个配置（大多数打印机只有一个配置）
    if (device.configuration === null) {
      await device.selectConfiguration(1)
    }

    const config = device.configuration!
    let found = findPrinterEndpoint(config)
    if (!found) {
      found = findAnyOutEndpoint(config)
    }

    if (!found) {
      await device.close()
      throw new UsbPrinterError('未找到可用的打印输出端点', 'ENDPOINT_NOT_FOUND')
    }

    await device.claimInterface(found.ifaceNumber)

    return {
      device,
      ifaceNumber: found.ifaceNumber,
      endpointNumber: found.endpointNumber,
      name: device.productName || 'USB打印机',
    }
  } catch (err: unknown) {
    if (err instanceof UsbPrinterError) throw err
    if (err instanceof Error && err.name === 'NotFoundError') {
      throw new UsbPrinterError('未选择打印机或设备未找到', 'USER_CANCELLED')
    }
    if (err instanceof Error && err.name === 'SecurityError') {
      throw new UsbPrinterError('浏览器阻止了 USB 访问，请检查权限设置', 'SECURITY_DENIED')
    }
    throw new UsbPrinterError(
      err instanceof Error ? err.message : 'USB 连接失败',
      'CONNECTION_FAILED',
    )
  }
}

/**
 * 发送 ESC/POS 数据到 USB 打印机
 * USB Full Speed bulk endpoint 最大包长 64 字节，需分片发送
 */
export async function sendToUsbPrinter(
  printer: UsbPrinterDevice,
  data: Uint8Array,
): Promise<void> {
  const MAX_CHUNK = 64
  for (let offset = 0; offset < data.length; offset += MAX_CHUNK) {
    const chunk = data.slice(offset, offset + MAX_CHUNK)
    await printer.device.transferOut(printer.endpointNumber, chunk)
  }
}

/**
 * 断开 USB 打印机
 */
export function disconnectUsbPrinter(printer: UsbPrinterDevice | null): void {
  if (!printer) return
  try {
    printer.device.releaseInterface(printer.ifaceNumber).catch(() => {})
    printer.device.close().catch(() => {})
  } catch {
    // ignore
  }
}

/**
 * 一键打印（连接 + 发送）
 */
export async function printBillViaUsb(
  order: BluetoothPrintOrder,
  paperWidth: 48 | 32 = 48,
): Promise<UsbPrinterDevice> {
  const printer = await connectUsbPrinter()
  const escposData = generateEscPosBill(order, paperWidth)
  await sendToUsbPrinter(printer, escposData)
  return printer
}
