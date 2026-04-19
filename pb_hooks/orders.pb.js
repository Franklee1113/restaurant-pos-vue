/**
 * 智能点菜系统 - 订单核心业务后端钩子
 * 作用：将金额计算、状态机推断、table_status 同步等关键业务逻辑从前端收归后端
 * 适用：PocketBase v0.22+
 * 注意：PocketBase JS VM 中 record.get('items') / record.get('cutlery') 返回 []byte，
 *       即使是 null 值也可能返回 length=0 的对象，因此解析前必须判断 raw && raw.length > 0
 */

function parseJSONField(record, fieldName, defaultValue = []) {
  try {
    const raw = record.get(fieldName)
    if (raw && raw.length > 0) {
      let s = ''
      for (let i = 0; i < raw.length; i++) {
        s += String.fromCharCode(raw[i])
      }
      if (s.length > 0) {
        return JSON.parse(s)
      }
    }
  } catch (e) {
    console.error('parseJSONField error (' + fieldName + '):', e)
  }
  return defaultValue
}

/**
 * 从 dishes 集合获取餐具单价（category === '餐具'）
 */
function getCutleryUnitPrice() {
  try {
    const records = $app.dao().findRecordsByFilter('dishes', "category='餐具'", '', 1, 0)
    if (records && records.length > 0) {
      return records[0].get('price') || 0
    }
  } catch (e) {
    console.error('getCutleryUnitPrice error:', e)
  }
  return 0
}

/**
 * 根据餐具数量和 dishes 集合单价，重新计算 cutlery 金额
 * 不信任前端传入的 cutlery.totalPrice
 */
function recalculateCutlery(record, cutlery) {
  if (!cutlery || cutlery.quantity <= 0 || cutlery.type === 'free') {
    return { cutleryTotalPrice: 0, updatedCutlery: cutlery }
  }
  const unitPrice = getCutleryUnitPrice()
  const totalPrice = Math.round(cutlery.quantity * unitPrice * 100) / 100
  const updatedCutlery = {
    ...cutlery,
    unitPrice: unitPrice,
    totalPrice: totalPrice,
  }
  record.set('cutlery', JSON.stringify(updatedCutlery))
  return { cutleryTotalPrice: totalPrice, updatedCutlery }
}

// ─────────────────────────────────────────────────────────────
// 创建订单前：强制重算金额（不信任前端金额）
// ─────────────────────────────────────────────────────────────
onRecordBeforeCreateRequest(
  (e) => {
    try {
      const record = e.record

      // 解析 items
      let items = parseJSONField(record, 'items', [])
      if (!Array.isArray(items)) items = []

      // 解析 cutlery
      let cutlery = parseJSONField(record, 'cutlery', null)

      const discountType = record.get('discountType') || 'amount'
      const rawDiscountValue = record.get('discountValue')
      const discountValue = rawDiscountValue !== undefined && rawDiscountValue !== null ? rawDiscountValue : 0

      // P1-21: 直接计算 price * 100 * quantity，避免先 round×10 导致的精度偏差
      let totalCents = 0
      for (let i = 0; i < items.length; i++) {
        totalCents += Math.round((items[i].price || 0) * 100 * (items[i].quantity || 0))
      }
      const { cutleryTotalPrice } = recalculateCutlery(record, cutlery)
      if (cutleryTotalPrice > 0) {
        totalCents += Math.round(cutleryTotalPrice * 100)
      }

      let discountCents = 0
      if (discountType === 'percent') {
        if (discountValue > 0 && discountValue <= 10) {
          discountCents = totalCents - Math.round(totalCents * (discountValue / 10))
        }
      } else {
        discountCents = Math.round((discountValue || 0) * 100)
      }
      discountCents = Math.min(discountCents, totalCents)
      const finalCents = Math.max(0, totalCents - discountCents)

      record.set('totalAmount', totalCents / 100)
      record.set('discount', discountCents / 100)
      record.set('finalAmount', finalCents / 100)
    } catch (err) {
      console.error('HOOK_BEFORE_CREATE_ERROR:', err)
      throw err
    }
  },
  'orders',
)

// ─────────────────────────────────────────────────────────────
// 更新订单前：检测菜品状态变更 + 自动推断整体状态 + 重算金额
// ─────────────────────────────────────────────────────────────
onRecordBeforeUpdateRequest(
  (e) => {
    try {
      const record = e.record

      // 查询旧记录（PocketBase JS VM 中 record.original() 不可用）
      const original = $app.dao().findRecordById('orders', record.id)

      // 解析新 items
      let newItems = parseJSONField(record, 'items', [])
      if (!Array.isArray(newItems)) newItems = []

      // 解析旧 items
      let oldItems = parseJSONField(original, 'items', [])
      if (!Array.isArray(oldItems)) oldItems = []

      const oldStatus = original.get('status')

      // P1-26: 检测是否有新菜品追加（逐条比较 id+quantity，而非仅比较长度）
      let itemsAppended = false
      if (newItems.length > oldItems.length) {
        itemsAppended = true
      } else if (newItems.length === oldItems.length) {
        for (let i = 0; i < newItems.length; i++) {
          if (newItems[i].dishId !== oldItems[i].dishId || newItems[i].quantity !== oldItems[i].quantity) {
            itemsAppended = true
            break
          }
        }
      }

      // 检测是否仅菜品状态发生变化
      let itemStatusChanged = false
      if (oldItems.length === newItems.length && newItems.length > 0) {
        let diffCount = 0
        for (let i = 0; i < newItems.length; i++) {
          if ((oldItems[i].status || 'pending') !== (newItems[i].status || 'pending')) {
            diffCount++
          }
        }
        if (diffCount > 0) {
          itemStatusChanged = true
          // 追加菜品导致的状态回退允许修改
          // P1-27: 补充 serving 拦截，已结束/上菜中订单不允许修改菜品状态
          if (!itemsAppended && (oldStatus === 'completed' || oldStatus === 'cancelled' || oldStatus === 'settled' || oldStatus === 'serving')) {
            throw new Error('订单已结束，不能修改菜品状态')
          }
        }
      }

      // 已取消订单不允许追加菜品
      if (itemsAppended && oldStatus === 'cancelled') {
        throw new Error('订单已取消，不能追加菜品')
      }

      // 如果有新菜品追加到已结束订单，重置为 pending 并重新开台
      if (itemsAppended && (oldStatus === 'completed' || oldStatus === 'serving')) {
        record.set('status', 'pending')
        try {
          const tableNo = record.get('tableNo')
          if (tableNo) {
            const records = $app.dao().findRecordsByFilter(
              'table_status',
              'tableNo = {:tableNo}',
              '',
              1,
              0,
              { tableNo: tableNo },
            )
            if (records && records.length > 0) {
              const ts = records[0]
              ts.set('status', 'dining')
              ts.set('currentOrderId', record.id)
              $app.dao().saveRecord(ts)
            } else {
              const collection = $app.dao().findCollectionByNameOrId('table_status')
              const ts = new Record(collection)
              ts.set('tableNo', tableNo)
              ts.set('status', 'dining')
              ts.set('currentOrderId', record.id)
              ts.set('openedAt', new Date().toISOString())
              $app.dao().saveRecord(ts)
            }
          }
        } catch (err) {
          // P1-25: 重新开台失败让异常上浮，不再静默吞掉
          console.error('table_status re-open error:', err)
          throw new Error('重新开台失败: ' + err.message)
        }
      }

      // P1-22: 始终执行金额重算，即使 items 为空（删除全部菜品后金额应归零）
      if (true) {
        // 解析 cutlery（优先新记录，再原记录）
        let cutlery = parseJSONField(record, 'cutlery', null)
        if (!cutlery) {
          cutlery = parseJSONField(original, 'cutlery', null)
        }

        const discountType = record.get('discountType') !== undefined && record.get('discountType') !== null ? record.get('discountType') : (original.get('discountType') || 'amount')
        const rawDiscountValue = record.get('discountValue')
        const rawOriginalDiscountValue = original.get('discountValue')
        const discountValue = rawDiscountValue !== undefined && rawDiscountValue !== null ? rawDiscountValue : (rawOriginalDiscountValue !== undefined && rawOriginalDiscountValue !== null ? rawOriginalDiscountValue : 0)

        // P1-21: 直接计算 price * 100 * quantity
        let totalCents = 0
        for (let i = 0; i < newItems.length; i++) {
          totalCents += Math.round((newItems[i].price || 0) * 100 * (newItems[i].quantity || 0))
        }
        const { cutleryTotalPrice } = recalculateCutlery(record, cutlery)
        if (cutleryTotalPrice > 0) {
          totalCents += Math.round(cutleryTotalPrice * 100)
        }

        let discountCents = 0
        if (discountType === 'percent') {
          if (discountValue > 0 && discountValue <= 10) {
            discountCents = totalCents - Math.round(totalCents * (discountValue / 10))
          }
        } else {
          discountCents = Math.round((discountValue || 0) * 100)
        }
        discountCents = Math.min(discountCents, totalCents)
        const finalCents = Math.max(0, totalCents - discountCents)

        record.set('totalAmount', totalCents / 100)
        record.set('discount', discountCents / 100)
        record.set('finalAmount', finalCents / 100)
      }

      // 自动推断并更新订单整体状态
      if (itemStatusChanged) {
        let allServed = true
        let allDone = true
        let anyCooking = false
        for (let i = 0; i < newItems.length; i++) {
          const st = newItems[i].status || 'pending'
          if (st !== 'served') allServed = false
          if (st !== 'cooked' && st !== 'served') allDone = false
          if (st === 'cooking') anyCooking = true
        }

        let inferred = 'pending'
        if (allServed) inferred = 'completed'
        else if (allDone) inferred = 'serving'
        else if (anyCooking) inferred = 'cooking'

        if (oldStatus !== inferred) {
          const flow = {
            pending: ['cooking', 'cancelled'],
            cooking: ['serving', 'cancelled'],
            serving: ['completed'],
            completed: ['pending'],
            cancelled: [],
          }
          if ((flow[oldStatus] || []).indexOf(inferred) === -1) {
            throw new Error('非法状态流转: ' + oldStatus + ' -> ' + inferred)
          }
          record.set('status', inferred)
        }
      }
    } catch (err) {
      console.error('HOOK_BEFORE_UPDATE_ERROR:', err)
      throw err
    }
  },
  'orders',
)

// ─────────────────────────────────────────────────────────────
// 创建订单后：自动开台（同步 table_status）
// ─────────────────────────────────────────────────────────────
onRecordAfterCreateRequest(
  (e) => {
    const record = e.record
    const tableNo = record.get('tableNo')
    const status = record.get('status')
    if (!tableNo || status === 'cancelled') return

    try {
      const records = $app.dao().findRecordsByFilter(
        'table_status',
        'tableNo = {:tableNo}',
        '',
        1,
        0,
        { tableNo: tableNo },
      )

      if (records && records.length > 0) {
        const ts = records[0]
        // P1-23: 检查桌台是否已被占用（已有未完成订单绑定）
        const existingOrderId = ts.get('currentOrderId')
        if (ts.get('status') === 'dining' && existingOrderId && existingOrderId !== record.id) {
          throw new Error('该桌台已被占用，无法创建新订单')
        }
        ts.set('status', 'dining')
        ts.set('currentOrderId', record.id)
        ts.set('openedAt', new Date().toISOString())
        $app.dao().saveRecord(ts)
      } else {
        const collection = $app.dao().findCollectionByNameOrId('table_status')
        const ts = new Record(collection)
        ts.set('tableNo', tableNo)
        ts.set('status', 'dining')
        ts.set('currentOrderId', record.id)
        ts.set('openedAt', new Date().toISOString())
        $app.dao().saveRecord(ts)
      }
    } catch (err) {
      console.error('table_status sync error (create):', err)
    }
  },
  'orders',
)

// ─────────────────────────────────────────────────────────────
// 更新订单后：订单完成/取消时自动清台
// ─────────────────────────────────────────────────────────────
onRecordAfterUpdateRequest(
  (e) => {
    const record = e.record
    const status = record.get('status')
    const tableNo = record.get('tableNo')

    if (!tableNo || (status !== 'completed' && status !== 'cancelled')) return

    try {
      const records = $app.dao().findRecordsByFilter(
        'table_status',
        'tableNo = {:tableNo}',
        '',
        1,
        0,
        { tableNo: tableNo },
      )

      if (records && records.length > 0) {
        const ts = records[0]
        // 仅当该桌当前绑定的订单就是此订单时才清台，防止覆盖新订单
        if (ts.get('currentOrderId') === record.id) {
          ts.set('status', 'idle')
          ts.set('currentOrderId', '')
          $app.dao().saveRecord(ts)
        }
      }
    } catch (err) {
      console.error('table_status sync error (update):', err)
    }
  },
  'orders',
)
