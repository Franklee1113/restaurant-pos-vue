/**
 * 智能点菜系统 - 订单核心业务后端钩子
 * 作用：将金额计算、状态机推断、table_status 同步等关键业务逻辑从前端收归后端
 * 适用：PocketBase v0.22+
 * 注意：PocketBase JS VM 中 record.get('items') / record.get('cutlery') 返回 []byte，
 *       即使是 null 值也可能返回 length=0 的对象，因此解析前必须判断 raw && raw.length > 0
 */

// ─────────────────────────────────────────────────────────────
// 创建订单前：强制重算金额（不信任前端金额）
// ─────────────────────────────────────────────────────────────
onRecordBeforeCreateRequest(
  (e) => {
    try {
      const record = e.record

      // 解析 items
      let items = []
      const rawItems = record.get('items')
      if (rawItems && rawItems.length > 0) {
        let s = ''
        for (let i = 0; i < rawItems.length; i++) {
          s += String.fromCharCode(rawItems[i])
        }
        if (s.length > 0) {
          items = JSON.parse(s)
        }
      }
      if (!Array.isArray(items)) items = []

      // 解析 cutlery
      let cutlery = null
      const rawCutlery = record.get('cutlery')
      if (rawCutlery && rawCutlery.length > 0) {
        let s = ''
        for (let i = 0; i < rawCutlery.length; i++) {
          s += String.fromCharCode(rawCutlery[i])
        }
        if (s.length > 0) {
          cutlery = JSON.parse(s)
        }
      }

      const discountType = record.get('discountType') || 'amount'
      const discountValue = record.get('discountValue') || 0

      // 金额计算（分）
      let totalCents = 0
      for (let i = 0; i < items.length; i++) {
        const priceCents = Math.round((items[i].price || 0) * 100)
        const qty = Math.round((items[i].quantity || 0) * 10)
        totalCents += Math.round((priceCents * qty) / 10)
      }
      if (cutlery && cutlery.totalPrice > 0) {
        totalCents += Math.round(cutlery.totalPrice * 100)
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
      console.log('HOOK_BEFORE_CREATE_ERROR:', err)
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
      let newItems = []
      const rawNewItems = record.get('items')
      if (rawNewItems && rawNewItems.length > 0) {
        let s = ''
        for (let i = 0; i < rawNewItems.length; i++) {
          s += String.fromCharCode(rawNewItems[i])
        }
        if (s.length > 0) {
          newItems = JSON.parse(s)
        }
      }
      if (!Array.isArray(newItems)) newItems = []

      // 解析旧 items
      let oldItems = []
      const rawOldItems = original.get('items')
      if (rawOldItems && rawOldItems.length > 0) {
        let s = ''
        for (let i = 0; i < rawOldItems.length; i++) {
          s += String.fromCharCode(rawOldItems[i])
        }
        if (s.length > 0) {
          oldItems = JSON.parse(s)
        }
      }
      if (!Array.isArray(oldItems)) oldItems = []

      const oldStatus = original.get('status')

      // 检测是否有新菜品追加
      let itemsAppended = false
      if (newItems.length > oldItems.length) {
        itemsAppended = true
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
          if (!itemsAppended && (oldStatus === 'completed' || oldStatus === 'cancelled')) {
            throw new Error('订单已结束，不能修改菜品状态')
          }
        }
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
          console.log('table_status re-open error:', err)
        }
      }

      // 只要 items 有变化就重算金额
      if (newItems.length > 0) {
        // 解析 cutlery（优先新记录，再原记录）
        let cutlery = null
        const rawCutleryNew = record.get('cutlery')
        if (rawCutleryNew && rawCutleryNew.length > 0) {
          let s = ''
          for (let i = 0; i < rawCutleryNew.length; i++) {
            s += String.fromCharCode(rawCutleryNew[i])
          }
          if (s.length > 0) {
            cutlery = JSON.parse(s)
          }
        }
        if (!cutlery) {
          const rawCutleryOld = original.get('cutlery')
          if (rawCutleryOld && rawCutleryOld.length > 0) {
            let s = ''
            for (let i = 0; i < rawCutleryOld.length; i++) {
              s += String.fromCharCode(rawCutleryOld[i])
            }
            if (s.length > 0) {
              cutlery = JSON.parse(s)
            }
          }
        }

        const discountType = record.get('discountType') || original.get('discountType') || 'amount'
        const discountValue = record.get('discountValue') || original.get('discountValue') || 0

        let totalCents = 0
        for (let i = 0; i < newItems.length; i++) {
          const priceCents = Math.round((newItems[i].price || 0) * 100)
          const qty = Math.round((newItems[i].quantity || 0) * 10)
          totalCents += Math.round((priceCents * qty) / 10)
        }
        if (cutlery && cutlery.totalPrice > 0) {
          totalCents += Math.round(cutlery.totalPrice * 100)
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
      console.log('HOOK_BEFORE_UPDATE_ERROR:', err)
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
      console.log('table_status sync error (create):', err)
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
      console.log('table_status sync error (update):', err)
    }
  },
  'orders',
)
