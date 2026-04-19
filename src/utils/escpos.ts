/**
 * ESC/POS 热敏打印机指令生成器
 * P3-4: 蓝牙打印机支持
 *
 * 参考: EPSON ESC/POS Command Reference
 */

export class EscPosBuilder {
  private buffer: number[] = []

  // 初始化打印机
  init(): this {
    this.buffer.push(0x1b, 0x40)
    return this
  }

  // 文本编码（默认 GB18030 兼容中文）
  text(str: string): this {
    const encoder = new TextEncoder()
    const bytes = encoder.encode(str)
    for (const b of bytes) {
      this.buffer.push(b)
    }
    return this
  }

  // 换行
  newline(count = 1): this {
    for (let i = 0; i < count; i++) {
      this.buffer.push(0x0a)
    }
    return this
  }

  // 对齐方式
  align(align: 'left' | 'center' | 'right'): this {
    const map = { left: 0x00, center: 0x01, right: 0x02 }
    this.buffer.push(0x1b, 0x61, map[align])
    return this
  }

  // 字体大小
  size(normal: boolean): this {
    if (normal) {
      this.buffer.push(0x1d, 0x21, 0x00)
    } else {
      this.buffer.push(0x1d, 0x21, 0x11) // 2倍宽高
    }
    return this
  }

  // 加粗
  bold(on: boolean): this {
    this.buffer.push(0x1b, 0x45, on ? 0x01 : 0x00)
    return this
  }

  // 下划线
  underline(on: boolean): this {
    this.buffer.push(0x1b, 0x2d, on ? 0x01 : 0x00)
    return this
  }

  // 走纸（单位：行）
  feed(lines = 1): this {
    this.buffer.push(0x1b, 0x64, lines)
    return this
  }

  // 切纸（部分切）
  cut(): this {
    this.buffer.push(0x1d, 0x56, 0x01)
    return this
  }

  // 打开钱箱
  openCashDrawer(): this {
    this.buffer.push(0x1b, 0x70, 0x00, 0x3c, 0x78)
    return this
  }

  // 设置字符编码（简体中文）
  setChineseCodePage(): this {
    // ESC t n: 选择字符编码表 n=0x00 (PC437) 默认
    // FS & : 进入汉字模式
    this.buffer.push(0x1c, 0x26)
    return this
  }

  // 获取完整 Uint8Array
  build(): Uint8Array {
    return new Uint8Array(this.buffer)
  }

  // 获取当前 buffer 长度
  get length(): number {
    return this.buffer.length
  }
}

/**
 * 将账单数据转换为 ESC/POS 指令
 */
export interface BluetoothPrintOrder {
  restaurantName: string
  orderNo: string
  tableNo: string
  guests: number
  items: Array<{ name: string; quantity: number; price: number; remark?: string }>
  totalAmount: number
  discount: number
  finalAmount: number
  remark?: string
  created: string
}

export function generateEscPosBill(order: BluetoothPrintOrder, paperWidth: 48 | 32 = 48): Uint8Array {
  const b = new EscPosBuilder()
  b.init().setChineseCodePage()

  // 标题
  b.align('center').size(false).bold(true)
  b.text(order.restaurantName || '智能点菜系统')
  b.size(true).bold(false).newline(2)

  // 订单信息
  b.align('left')
  b.text(`订单号: ${order.orderNo}`).newline()
  b.text(`桌号: ${order.tableNo}    人数: ${order.guests}人`).newline()
  b.text(`时间: ${new Date(order.created).toLocaleString('zh-CN')}`).newline()
  b.text('-'.repeat(paperWidth / 2)).newline()

  // 表头
  b.bold(true)
  b.text('菜品').feed(0)
  b.align('right')
  b.text('数量  单价  小计').newline()
  b.bold(false)
  b.align('left')

  // 菜品
  for (const item of order.items) {
    const name = item.name.length > 10 ? item.name.slice(0, 10) : item.name
    const subtotal = (item.price * item.quantity).toFixed(2)
    b.text(`${name}  x${item.quantity}  ${item.price.toFixed(2)}  ${subtotal}`).newline()
    if (item.remark) {
      b.text(`  [${item.remark}]`).newline()
    }
  }

  b.text('-'.repeat(paperWidth / 2)).newline()

  // 汇总
  b.align('right')
  b.text(`合计: ${order.totalAmount.toFixed(2)}`).newline()
  if (order.discount > 0) {
    b.text(`优惠: -${order.discount.toFixed(2)}`).newline()
  }
  b.bold(true)
  b.text(`实付: ${order.finalAmount.toFixed(2)}`).newline()
  b.bold(false)

  if (order.remark) {
    b.align('left')
    b.text(`备注: ${order.remark}`).newline()
  }

  b.align('center').newline(2)
  b.text('谢谢惠顾，欢迎下次光临！').newline()
  b.feed(3).cut()

  return b.build()
}
