import { type Order, type Settings } from '@/api/pocketbase'
import { getFileUrl } from '@/utils/assets'
import { MoneyCalculator } from './security'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function getQrImageUrl(settings: Settings | null, field: 'wechatPayQr' | 'alipayQr'): string | null {
  return getFileUrl('settings', settings?.id, settings?.[field])
}

export function generateBillHTML(order: Order, settings: Settings | null): string {
  const restaurantName = escapeHtml(settings?.restaurantName || '智能点菜系统')
  const address = escapeHtml(settings?.address || '')
  const phone = escapeHtml(settings?.phone || '')
  const orderNo = escapeHtml(order.orderNo || '')
  const tableNo = escapeHtml(order.tableNo || '')
  const orderDate = new Date(order.created).toLocaleString('zh-CN')

  let itemsHTML = ''
  let totalQty = 0

  if (order.items && order.items.length > 0) {
    itemsHTML = order.items
      .map((item) => {
        totalQty += item.quantity
        const subtotal = MoneyCalculator.calculate([{ price: item.price, quantity: item.quantity }], 0).total
        const remark = item.remark ? ` <span style="font-size:10px;color:#666;">(${escapeHtml(item.remark)})</span>` : ''
        return `
        <tr>
          <td>${escapeHtml(item.name)}${remark}</td>
          <td class="text-right">${item.quantity}</td>
          <td class="text-right">¥${item.price.toFixed(2)}</td>
          <td class="text-right">¥${subtotal.toFixed(2)}</td>
        </tr>
      `
      })
      .join('')
  }

  // 餐具信息
  const cutlery = order.cutlery
  const cutleryHtml = cutlery && cutlery.quantity > 0
    ? `<tr>
        <td>餐具 (${cutlery.type === 'charged' ? '收费' : '免费'})</td>
        <td class="text-right">${cutlery.quantity}</td>
        <td class="text-right">${cutlery.type === 'charged' ? `¥${cutlery.unitPrice.toFixed(2)}` : '-'}</td>
        <td class="text-right">${cutlery.type === 'charged' ? `¥${cutlery.totalPrice.toFixed(2)}` : '-'}</td>
      </tr>`
    : ''

  const remarkHtml = order.remark
    ? `<div style="margin:8px 0;padding:6px;border:1px dashed #999;font-size:12px;"><strong>备注:</strong> ${escapeHtml(order.remark)}</div>`
    : ''

  // 计算菜品小计（从总金额中减去餐具费）
  const dishesTotal = cutlery && cutlery.type === 'charged' 
    ? (order.totalAmount || 0) - cutlery.totalPrice 
    : (order.totalAmount || 0)

  // 收款码
  const wechatQr = getQrImageUrl(settings, 'wechatPayQr')
  const alipayQr = getQrImageUrl(settings, 'alipayQr')
  const hasAnyQr = wechatQr || alipayQr
  const qrHtml = hasAnyQr
    ? `<div style="text-align:center; margin-top:12px; padding-top:12px; border-top:1px dashed #000;">
        <div style="font-size:13px; font-weight:bold; margin-bottom:4px;">应付: ¥${(order.finalAmount || order.totalAmount || 0).toFixed(2)}</div>
        <div style="font-size:10px; color:#666; margin-bottom:6px;">微信/支付宝扫码付款</div>
        <div style="display:flex; justify-content:center; gap:8px;">
          ${wechatQr ? `<div><img src="${wechatQr}" style="width:28mm; height:28mm; object-fit:contain;" /><div style="font-size:9px; margin-top:2px;">微信支付</div></div>` : ''}
          ${alipayQr ? `<div><img src="${alipayQr}" style="width:28mm; height:28mm; object-fit:contain;" /><div style="font-size:9px; margin-top:2px;">支付宝</div></div>` : ''}
        </div>
        <div style="font-size:9px; color:#999; margin-top:4px;">付款后请告知服务员确认</div>
      </div>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>账单 - ${orderNo}</title>
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
      <div class="info-row"><span>订单号:</span><span>${orderNo}</span></div>
      <div class="info-row"><span>桌号:</span><span>${tableNo}</span></div>
      <div class="info-row"><span>人数:</span><span>${order.guests || 1}人</span></div>
      <div class="info-row"><span>时间:</span><span>${orderDate}</span></div>
    </div>
    ${remarkHtml}
    <table>
      <thead><tr><th>菜品</th><th class="text-right">数量</th><th class="text-right">单价</th><th class="text-right">小计</th></tr></thead>
      <tbody>${itemsHTML}${cutleryHtml}</tbody>
    </table>
    <div class="summary">
      <div class="summary-row"><span>菜品总数:</span><span>${totalQty}份</span></div>
      <div class="summary-row"><span>菜品小计:</span><span>¥${dishesTotal.toFixed(2)}</span></div>
      ${cutlery && cutlery.type === 'charged' && cutlery.quantity > 0 ? `<div class="summary-row"><span>餐具费 (${cutlery.quantity}套):</span><span>¥${cutlery.totalPrice.toFixed(2)}</span></div>` : ''}
      <div class="summary-row"><span>小计:</span><span>¥${(order.totalAmount || 0).toFixed(2)}</span></div>
      ${order.discount ? `<div class="summary-row"><span>折扣:</span><span>-¥${order.discount.toFixed(2)}${order.discountType === 'percent' ? ` (${order.discountValue}折)` : ''}</span></div>` : ''}
      <div class="summary-row total"><span>合计:</span><span>¥${(order.finalAmount || order.totalAmount || 0).toFixed(2)}</span></div>
    </div>
    <div class="footer"><div>谢谢惠顾，欢迎下次光临！</div></div>
    ${qrHtml}
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
  const restaurantName = escapeHtml(settings?.restaurantName || '智能点菜系统')
  const tableNo = escapeHtml(order.tableNo || '')
  const orderNo = escapeHtml(order.orderNo || '')
  const orderDate = new Date(order.created).toLocaleString('zh-CN')

  let itemsHTML = ''
  if (order.items && order.items.length > 0) {
    itemsHTML = order.items
      .map(
        (item) => {
          const remark = item.remark ? `<div style="font-size:14px;color:#c00;margin-top:2px;">备注:${escapeHtml(item.remark)}</div>` : ''
          return `
      <div class="kitchen-item">
        <div style="flex:1;">
          <span class="item-name">${escapeHtml(item.name)}</span>
          ${remark}
        </div>
        <span class="item-qty">×${item.quantity}</span>
      </div>
    `
        },
      )
      .join('')
  }

  // 餐具信息（后厨单显示）
  const cutlery = order.cutlery
  const cutleryHtml = cutlery && cutlery.quantity > 0
    ? `<div class="kitchen-item" style="background:#f0f0f0;padding:8px;margin-top:8px;">
        <div style="flex:1;">
          <span class="item-name">餐具 (${cutlery.type === 'charged' ? '收费' : '免费'})</span>
        </div>
        <span class="item-qty">×${cutlery.quantity}</span>
      </div>`
    : ''

  const remarkHtml = order.remark
    ? `<div style="margin:10px 0;padding:8px;border:2px dashed #c00;font-size:16px;color:#c00;font-weight:bold;"><strong>整单备注:</strong> ${escapeHtml(order.remark)}</div>`
    : ''

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>后厨单 - ${orderNo}</title>
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
      <div class="info-row"><span>桌号:</span><span style="font-size: 20px; font-weight: bold;">${tableNo}</span></div>
      <div class="info-row"><span>订单号:</span><span>${orderNo}</span></div>
      <div class="info-row"><span>时间:</span><span>${orderDate}</span></div>
    </div>
    ${remarkHtml}
    <div class="kitchen-items">${itemsHTML}${cutleryHtml}</div>
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
