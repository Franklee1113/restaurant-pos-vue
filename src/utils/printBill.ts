import type { Order, Settings } from '@/api/pocketbase'

export function generateBillHTML(order: Order, settings: Settings | null): string {
  const restaurantName = settings?.restaurantName || '智能点菜系统'
  const address = settings?.address || ''
  const phone = settings?.phone || ''
  const orderDate = new Date(order.created).toLocaleString('zh-CN')

  let itemsHTML = ''
  let totalQty = 0

  if (order.items && order.items.length > 0) {
    itemsHTML = order.items
      .map((item) => {
        totalQty += item.quantity
        const subtotal = item.price * item.quantity
        return `
        <tr>
          <td>${item.name}</td>
          <td class="text-right">${item.quantity}</td>
          <td class="text-right">¥${item.price.toFixed(2)}</td>
          <td class="text-right">¥${subtotal.toFixed(2)}</td>
        </tr>
      `
      })
      .join('')
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>账单 - ${order.orderNo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.4; padding: 10px; max-width: 80mm; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
    .restaurant-name { font-size: 16px; font-weight: bold; margin-bottom: 5px; }
    .info { margin-bottom: 10px; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: 3px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th, td { text-align: left; padding: 3px 0; }
    th { border-bottom: 1px solid #000; }
    .text-right { text-align: right; }
    .summary { border-top: 1px dashed #000; padding-top: 10px; margin-top: 10px; }
    .summary-row { display: flex; justify-content: space-between; margin-bottom: 3px; }
    .total { font-size: 14px; font-weight: bold; border-top: 1px solid #000; padding-top: 5px; margin-top: 5px; }
    .footer { text-align: center; margin-top: 20px; padding-top: 10px; border-top: 1px dashed #000; }
    @media print { body { padding: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="restaurant-name">${restaurantName}</div>
    ${address ? `<div>${address}</div>` : ''}
    ${phone ? `<div>电话: ${phone}</div>` : ''}
  </div>
  <div class="info">
    <div class="info-row"><span>订单号:</span><span>${order.orderNo}</span></div>
    <div class="info-row"><span>桌号:</span><span>${order.tableNo}</span></div>
    <div class="info-row"><span>人数:</span><span>${order.guests || 1}人</span></div>
    <div class="info-row"><span>时间:</span><span>${orderDate}</span></div>
  </div>
  <table>
    <thead><tr><th>菜品</th><th class="text-right">数量</th><th class="text-right">单价</th><th class="text-right">小计</th></tr></thead>
    <tbody>${itemsHTML}</tbody>
  </table>
  <div class="summary">
    <div class="summary-row"><span>菜品总数:</span><span>${totalQty}份</span></div>
    <div class="summary-row"><span>小计:</span><span>¥${(order.totalAmount || 0).toFixed(2)}</span></div>
    ${order.discount ? `<div class="summary-row"><span>折扣:</span><span>-¥${order.discount.toFixed(2)}${order.discountType === 'percent' ? ` (${order.discountValue}折)` : ''}</span></div>` : ''}
    <div class="summary-row total"><span>合计:</span><span>¥${(order.finalAmount || order.totalAmount || 0).toFixed(2)}</span></div>
  </div>
  <div class="footer"><div>谢谢惠顾，欢迎下次光临！</div></div>
  <div class="no-print" style="margin-top: 20px; text-align: center;">
    <button onclick="window.print()" style="padding: 10px 20px; font-size: 14px;">打印账单</button>
    <button onclick="window.close()" style="padding: 10px 20px; font-size: 14px; margin-left: 10px;">关闭</button>
  </div>
</body>
</html>`
}

export function printBill(order: Order, settings: Settings | null): void {
  const html = generateBillHTML(order, settings)
  const printWindow = window.open('', '_blank', 'width=400,height=600')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
  }
}

export function printKitchenTicket(order: Order, settings: Settings | null): void {
  const restaurantName = settings?.restaurantName || '智能点菜系统'
  const orderDate = new Date(order.created).toLocaleString('zh-CN')

  let itemsHTML = ''
  if (order.items && order.items.length > 0) {
    itemsHTML = order.items
      .map(
        (item) => `
      <div class="kitchen-item">
        <span class="item-name">${item.name}</span>
        <span class="item-qty">×${item.quantity}</span>
      </div>
    `,
      )
      .join('')
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>后厨单 - ${order.orderNo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; font-size: 14px; line-height: 1.6; padding: 10px; max-width: 80mm; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 10px; }
    .title { font-size: 20px; font-weight: bold; }
    .info { margin-bottom: 15px; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 16px; }
    .kitchen-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #000; font-size: 18px; }
    .item-name { flex: 1; }
    .item-qty { font-weight: bold; font-size: 20px; }
    .footer { margin-top: 20px; text-align: center; font-size: 12px; }
    @media print { body { padding: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="header"><div class="title">后厨单</div><div>${restaurantName}</div></div>
  <div class="info">
    <div class="info-row"><span>桌号:</span><span style="font-size: 24px; font-weight: bold;">${order.tableNo}</span></div>
    <div class="info-row"><span>订单号:</span><span>${order.orderNo}</span></div>
    <div class="info-row"><span>时间:</span><span>${orderDate}</span></div>
  </div>
  <div class="kitchen-items">${itemsHTML}</div>
  <div class="footer"><div>请尽快出餐，谢谢！</div></div>
  <div class="no-print" style="margin-top: 20px; text-align: center;">
    <button onclick="window.print()" style="padding: 10px 20px; font-size: 14px;">打印</button>
    <button onclick="window.close()" style="padding: 10px 20px; font-size: 14px; margin-left: 10px;">关闭</button>
  </div>
</body>
</html>`

  const printWindow = window.open('', '_blank', 'width=400,height=600')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
  }
}
