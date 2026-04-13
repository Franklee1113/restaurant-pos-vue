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
        const remark = (item as any).remark ? ` <span style="font-size:10px;color:#666;">(${(item as any).remark})</span>` : ''
        return `
        <tr>
          <td>${item.name}${remark}</td>
          <td class="text-right">${item.quantity}</td>
          <td class="text-right">¥${item.price.toFixed(2)}</td>
          <td class="text-right">¥${subtotal.toFixed(2)}</td>
        </tr>
      `
      })
      .join('')
  }

  const remarkHtml = (order as any).remark
    ? `<div style="margin:8px 0;padding:6px;border:1px dashed #999;font-size:12px;"><strong>备注:</strong> ${(order as any).remark}</div>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>账单 - ${order.orderNo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: 80mm auto; margin: 0; }
    body { font-family: 'Courier New', 'Microsoft YaHei', monospace; font-size: 12px; line-height: 1.4; padding: 8px; width: 80mm; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 8px; border-bottom: 1px dashed #000; padding-bottom: 8px; }
    .restaurant-name { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
    .info { margin-bottom: 8px; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th, td { text-align: left; padding: 2px 0; font-size: 11px; }
    th { border-bottom: 1px solid #000; }
    .text-right { text-align: right; }
    .summary { border-top: 1px dashed #000; padding-top: 8px; margin-top: 8px; }
    .summary-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
    .total { font-size: 16px; font-weight: bold; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px; }
    .footer { text-align: center; margin-top: 16px; padding-top: 8px; border-top: 1px dashed #000; font-size: 11px; }
    .qrcode-area { text-align: center; margin-top: 10px; }
    @media print {
      body { padding: 0; width: 76mm; }
      .no-print { display: none !important; }
    }
    @media screen {
      body { background: #f5f5f5; }
      .ticket { background: #fff; padding: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
    }
  </style>
</head>
<body>
  <div class="ticket">
    <div class="header">
      <div class="restaurant-name">${restaurantName}</div>
      ${address ? `<div style="font-size:10px;">${address}</div>` : ''}
      ${phone ? `<div style="font-size:10px;">电话: ${phone}</div>` : ''}
    </div>
    <div class="info">
      <div class="info-row"><span>订单号:</span><span>${order.orderNo}</span></div>
      <div class="info-row"><span>桌号:</span><span>${order.tableNo}</span></div>
      <div class="info-row"><span>人数:</span><span>${order.guests || 1}人</span></div>
      <div class="info-row"><span>时间:</span><span>${orderDate}</span></div>
    </div>
    ${remarkHtml}
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
  </div>
  <div class="no-print" style="margin-top: 20px; text-align: center;">
    <button onclick="window.print()" style="padding: 10px 20px; font-size: 14px; cursor:pointer;">打印账单</button>
    <button onclick="window.close()" style="padding: 10px 20px; font-size: 14px; margin-left: 10px; cursor:pointer;">关闭</button>
  </div>
</body>
</html>`
}

export function printBill(order: Order, settings: Settings | null): void {
  const html = generateBillHTML(order, settings)
  const printWindow = window.open('', '_blank', 'width=360,height=700')
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
        (item) => {
          const remark = (item as any).remark ? `<div style="font-size:14px;color:#c00;margin-top:2px;">备注:${(item as any).remark}</div>` : ''
          return `
      <div class="kitchen-item">
        <div style="flex:1;">
          <span class="item-name">${item.name}</span>
          ${remark}
        </div>
        <span class="item-qty">×${item.quantity}</span>
      </div>
    `
        },
      )
      .join('')
  }

  const remarkHtml = (order as any).remark
    ? `<div style="margin:10px 0;padding:8px;border:2px dashed #c00;font-size:16px;color:#c00;font-weight:bold;"><strong>整单备注:</strong> ${(order as any).remark}</div>`
    : ''

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>后厨单 - ${order.orderNo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: 80mm auto; margin: 0; }
    body { font-family: 'Courier New', 'Microsoft YaHei', monospace; font-size: 14px; line-height: 1.5; padding: 8px; width: 80mm; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 12px; border-bottom: 2px solid #000; padding-bottom: 8px; }
    .title { font-size: 22px; font-weight: bold; }
    .info { margin-bottom: 12px; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 14px; }
    .kitchen-item { display: flex; justify-content: space-between; align-items:flex-start; padding: 6px 0; border-bottom: 1px dashed #000; }
    .item-name { font-size: 18px; font-weight: bold; }
    .item-qty { font-weight: bold; font-size: 20px; color: #c00; }
    .footer { margin-top: 16px; text-align: center; font-size: 12px; }
    @media print { body { padding: 0; width: 76mm; } .no-print { display: none !important; } }
    @media screen { body { background: #f5f5f5; } .ticket { background: #fff; padding: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); } }
  </style>
</head>
<body>
  <div class="ticket">
    <div class="header"><div class="title">后厨单</div><div style="font-size:12px;">${restaurantName}</div></div>
    <div class="info">
      <div class="info-row"><span>桌号:</span><span style="font-size: 20px; font-weight: bold;">${order.tableNo}</span></div>
      <div class="info-row"><span>订单号:</span><span>${order.orderNo}</span></div>
      <div class="info-row"><span>时间:</span><span>${orderDate}</span></div>
    </div>
    ${remarkHtml}
    <div class="kitchen-items">${itemsHTML}</div>
    <div class="footer"><div>请尽快出餐，谢谢！</div></div>
  </div>
  <div class="no-print" style="margin-top: 20px; text-align: center;">
    <button onclick="window.print()" style="padding: 10px 20px; font-size: 14px; cursor:pointer;">打印</button>
    <button onclick="window.close()" style="padding: 10px 20px; font-size: 14px; margin-left: 10px; cursor:pointer;">关闭</button>
  </div>
</body>
</html>`

  const printWindow = window.open('', '_blank', 'width=360,height=700')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
  }
}
