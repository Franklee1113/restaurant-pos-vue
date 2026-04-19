// Web Bluetooth API 类型声明（TypeScript 默认不包含）
// P3-4: 蓝牙打印机支持

interface BluetoothDevice extends EventTarget {
  readonly id: string
  readonly name: string | null
  readonly gatt: BluetoothRemoteGATTServer | null
  addEventListener(type: 'gattserverdisconnected', listener: EventListener): void
}

interface BluetoothRemoteGATTServer {
  readonly device: BluetoothDevice
  readonly connected: boolean
  connect(): Promise<BluetoothRemoteGATTServer>
  disconnect(): void
  getPrimaryService(service: string | number): Promise<BluetoothRemoteGATTService>
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: string | number): Promise<BluetoothRemoteGATTCharacteristic>
}

interface BluetoothRemoteGATTCharacteristic {
  readonly service: BluetoothRemoteGATTService
  readonly uuid: string
  writeValue(value: BufferSource): Promise<void>
}

interface Navigator {
  bluetooth: {
    requestDevice(options: {
      filters?: Array<Record<string, unknown>>
      optionalServices?: Array<string | number>
      acceptAllDevices?: boolean
    }): Promise<BluetoothDevice>
  }
}
