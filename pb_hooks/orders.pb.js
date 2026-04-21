/**
 * 智能点菜系统 - 订单核心业务后端钩子
 * 适用：PocketBase v0.22+
 * 注意：PocketBase JS VM (goja) 中各 hook 回调作用域隔离，
 *       所有辅助逻辑必须在每个 hook 内部内联定义，不可依赖外部函数。
 */

// ─────────────────────────────────────────────────────────────
// 创建订单前：强制重算金额（不信任前端金额）+ 校验菜品可售性
// ─────────────────────────────────────────────────────────────
onRecordBeforeCreateRequest(
  (e) => {
    try {
      const record = e.record

      // 为所有新订单生成 accessToken（支持服务员创建订单后顾客扫码加菜）
      if (!record.get('accessToken')) {
        record.set('accessToken', $security.randomString(43))
      }

      // 内联：解析 JSON 字段（PB VM 中返回 []byte）
      function parseJSONField(record, fieldName, defaultValue) {
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
        return defaultValue === undefined ? [] : defaultValue
      }

      // 内联：批量校验菜品可售性（避免 N+1 查询）
      function validateItemsSoldOut(items) {
        if (!items || items.length === 0) return

        // 去重 dishId
        const dishIdSet = new Set()
        for (let i = 0; i < items.length; i++) {
          dishIdSet.add(items[i].dishId)
        }
        const dishIds = Array.from(dishIdSet)
        if (dishIds.length === 0) return

        // 批量查询：使用 IN 语句找出已售罄的菜品
        const placeholders = dishIds.map(function (_, idx) {
          return '{:id' + idx + '}'
        }).join(',')
        const filter = 'id in (' + placeholders + ') && soldOut = true'

        const params = {}
        for (let i = 0; i < dishIds.length; i++) {
          params['id' + i] = dishIds[i]
        }

        try {
          const soldOutRecords = $app.dao().findRecordsByFilter('dishes', filter, '', 100, 0, params)
          if (soldOutRecords && soldOutRecords.length > 0) {
            // 收集已售罄菜品的名称
            const soldOutIds = new Set()
            for (let j = 0; j < soldOutRecords.length; j++) {
              soldOutIds.add(soldOutRecords[j].id)
            }
            const names = []
            for (let i = 0; i < items.length; i++) {
              if (soldOutIds.has(items[i].dishId)) {
                names.push(items[i].name)
              }
            }
            throw new Error('菜品 ' + names.join('、') + ' 已售罄，无法下单')
          }
        } catch (e) {
          if (e.message && e.message.indexOf('已售罄') !== -1) throw e
          console.error('validateItemsSoldOut error:', e)
        }
      }

      // 内联：获取餐具单价
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

      // 内联：重算餐具费
      function recalculateCutlery(record, cutlery) {
        if (!cutlery || cutlery.quantity <= 0 || cutlery.type === 'free') {
          return { cutleryTotalPrice: 0, updatedCutlery: cutlery }
        }
        const unitPrice = getCutleryUnitPrice()
        const totalPrice = Math.round(cutlery.quantity * unitPrice * 100) / 100
        const updatedCutlery = {
          quantity: cutlery.quantity,
          type: cutlery.type,
          unitPrice: unitPrice,
          totalPrice: totalPrice,
        }
        record.set('cutlery', JSON.stringify(updatedCutlery))
        return { cutleryTotalPrice: totalPrice, updatedCutlery: updatedCutlery }
      }

      // 解析 items
      let items = parseJSONField(record, 'items', [])
      if (!Array.isArray(items)) items = []

      // ── 新增：校验菜品可售性（在金额计算之前）──
      validateItemsSoldOut(items)

      // ── 新增：校验桌台是否被占用 ──
      const tableNo = record.get('tableNo')
      if (tableNo) {
        try {
          const tsRecords = $app.dao().findRecordsByFilter(
            'table_status',
            'tableNo = {:tableNo}',
            '',
            1,
            0,
            { tableNo: tableNo },
          )
          if (tsRecords && tsRecords.length > 0) {
            const ts = tsRecords[0]
            if (ts.get('status') === 'dining' && ts.get('currentOrderId')) {
              throw $app.newBadRequestError('该桌台已被占用（有未清台订单），请先清台后再新建订单', {})
            }
          }
        } catch (e) {
          if (e.message && e.message.indexOf('已被占用') !== -1) throw e
          console.error('table occupancy check error:', e)
        }
      }

      // 解析 cutlery
      let cutlery = parseJSONField(record, 'cutlery', null)

      const discountType = record.get('discountType') || 'amount'
      const rawDiscountValue = record.get('discountValue')
      const discountValue = rawDiscountValue !== undefined && rawDiscountValue !== null ? rawDiscountValue : 0

      // 直接计算 price * 100 * quantity
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
// 更新订单前：检测菜品状态变更 + 自动推断整体状态 + 重算金额 + 校验可售性
// ─────────────────────────────────────────────────────────────
onRecordBeforeUpdateRequest(
  (e) => {
    try {
      const record = e.record

      // 内联：解析 JSON 字段
      function parseJSONField(record, fieldName, defaultValue) {
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
        return defaultValue === undefined ? [] : defaultValue
      }

      // 内联：批量校验菜品可售性（避免 N+1 查询）
      function validateItemsSoldOut(items) {
        if (!items || items.length === 0) return

        const dishIdSet = new Set()
        for (let i = 0; i < items.length; i++) {
          dishIdSet.add(items[i].dishId)
        }
        const dishIds = Array.from(dishIdSet)
        if (dishIds.length === 0) return

        const placeholders = dishIds.map(function (_, idx) {
          return '{:id' + idx + '}'
        }).join(',')
        const filter = 'id in (' + placeholders + ') && soldOut = true'

        const params = {}
        for (let i = 0; i < dishIds.length; i++) {
          params['id' + i] = dishIds[i]
        }

        try {
          const soldOutRecords = $app.dao().findRecordsByFilter('dishes', filter, '', 100, 0, params)
          if (soldOutRecords && soldOutRecords.length > 0) {
            const soldOutIds = new Set()
            for (let j = 0; j < soldOutRecords.length; j++) {
              soldOutIds.add(soldOutRecords[j].id)
            }
            const names = []
            for (let i = 0; i < items.length; i++) {
              if (soldOutIds.has(items[i].dishId)) {
                names.push(items[i].name)
              }
            }
            throw new Error('菜品 ' + names.join('、') + ' 已售罄，无法下单')
          }
        } catch (e) {
          if (e.message && e.message.indexOf('已售罄') !== -1) throw e
          console.error('validateItemsSoldOut error:', e)
        }
      }

      // 内联：获取餐具单价
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

      // 内联：重算餐具费
      function recalculateCutlery(record, cutlery) {
        if (!cutlery || cutlery.quantity <= 0 || cutlery.type === 'free') {
          return { cutleryTotalPrice: 0, updatedCutlery: cutlery }
        }
        const unitPrice = getCutleryUnitPrice()
        const totalPrice = Math.round(cutlery.quantity * unitPrice * 100) / 100
        const updatedCutlery = {
          quantity: cutlery.quantity,
          type: cutlery.type,
          unitPrice: unitPrice,
          totalPrice: totalPrice,
        }
        record.set('cutlery', JSON.stringify(updatedCutlery))
        return { cutleryTotalPrice: totalPrice, updatedCutlery: updatedCutlery }
      }

      // 查询旧记录
      const original = $app.dao().findRecordById('orders', record.id)

      // 解析新 items
      let newItems = parseJSONField(record, 'items', [])
      if (!Array.isArray(newItems)) newItems = []

      // 解析旧 items
      let oldItems = parseJSONField(original, 'items', [])
      if (!Array.isArray(oldItems)) oldItems = []

      const oldStatus = original.get('status')

      // 检测是否有新菜品追加
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

      // ── 新增：如果有新菜品追加，校验可售性 ──
      if (itemsAppended && newItems.length > 0) {
        validateItemsSoldOut(newItems)
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
          if (!itemsAppended && (oldStatus === 'completed' || oldStatus === 'settled' || oldStatus === 'cancelled')) {
            throw new Error('订单已结束，不能修改菜品状态')
          }
        }
      }

      // 已取消订单不允许追加菜品
      if (itemsAppended && oldStatus === 'cancelled') {
        throw new Error('订单已取消，不能追加菜品')
      }

      // ── 新增：检测是否有已制作/已上菜的菜品被删除 ──
      const itemsRemoved = oldItems.length > newItems.length ||
        oldItems.some(function (oldItem) {
          return !newItems.find(function (ni) { return ni.dishId === oldItem.dishId })
        })

      if (itemsRemoved) {
        const removedItems = oldItems.filter(function (oi) {
          return !newItems.find(function (ni) { return ni.dishId === oi.dishId })
        })
        const hasCookingOrServed = removedItems.some(function (item) {
          return item.status === 'cooking' || item.status === 'cooked' || item.status === 'served'
        })
        if (hasCookingOrServed) {
          throw new Error('已制作/已上菜的菜品不可直接删除，如需退菜请联系管理员')
        }
      }

      // 始终执行金额重算
      {
        // P1-fix: 部分更新时（只改 status 等非 items 字段），newItems 为空，使用 oldItems 重算金额
        if (newItems.length === 0 && oldItems.length > 0) {
          newItems = oldItems
        }

        let cutlery = parseJSONField(record, 'cutlery', null)
        if (!cutlery) {
          cutlery = parseJSONField(original, 'cutlery', null)
        }

        const discountType = record.get('discountType') !== undefined && record.get('discountType') !== null ? record.get('discountType') : (original.get('discountType') || 'amount')
        const rawDiscountValue = record.get('discountValue')
        const rawOriginalDiscountValue = original.get('discountValue')
        const discountValue = rawDiscountValue !== undefined && rawDiscountValue !== null ? rawDiscountValue : (rawOriginalDiscountValue !== undefined && rawOriginalDiscountValue !== null ? rawOriginalDiscountValue : 0)

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
        if (allServed) inferred = 'dining'
        else if (allDone) inferred = 'serving'
        else if (anyCooking) inferred = 'cooking'

        if (oldStatus !== inferred) {
          const statusPriority = {
            pending: 0,
            cooking: 1,
            serving: 2,
            dining: 3,
            completed: 4,
            settled: 5,
            cancelled: -1,
          }

          // 单品状态更新不允许订单整体状态回退（如 serving -> cooking）
          if (statusPriority[inferred] < statusPriority[oldStatus]) {
            // 保持当前状态，静默忽略回退推断
          } else {
            const flow = {
              pending: ['cooking', 'cancelled'],
              cooking: ['serving', 'cancelled'],
              serving: ['dining', 'cancelled'],
              dining: ['completed', 'cancelled'],
              completed: ['settled'],
              settled: [],
              cancelled: [],
            }
            if ((flow[oldStatus] || []).indexOf(inferred) === -1) {
              throw new Error('非法状态流转: ' + oldStatus + ' -> ' + inferred)
            }
            record.set('status', inferred)
          }
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

    if (!tableNo || (status !== 'settled' && status !== 'cancelled')) return

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
