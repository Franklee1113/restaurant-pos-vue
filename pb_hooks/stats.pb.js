/**
 * 智能点菜系统 - 统计聚合后端路由
 * P1-37: 将 StatisticsView 的客户端聚合改为后端聚合，减少数据传输
 * 路由: GET /api/stats?start=YYYY-MM-DD&end=YYYY-MM-DD
 * 适用: PocketBase v0.22+ (SQLite3 with json1 extension)
 */

routerAdd('GET', '/api/stats', (c) => {
  const start = c.queryParam('start') || ''
  const end = c.queryParam('end') || ''

  // 基础日期过滤
  let dateFilter = ''
  if (start && end) {
    dateFilter = `created >= '${start}T00:00:00.000Z' AND created <= '${end}T23:59:59.999Z'`
  } else if (start) {
    dateFilter = `created >= '${start}T00:00:00.000Z'`
  } else if (end) {
    dateFilter = `created <= '${end}T23:59:59.999Z'`
  }

  const where = dateFilter ? `WHERE ${dateFilter}` : ''

  // 1. 订单级汇总
  const summaryQuery = `
    SELECT
      COUNT(*) AS totalOrders,
      SUM(CASE WHEN status = 'settled' THEN totalAmount ELSE 0 END) AS totalRevenue,
      SUM(CASE WHEN status = 'settled' THEN 1 ELSE 0 END) AS settledOrders,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completedOrders,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelledOrders
    FROM orders
    ${where}
  `

  // 2. 按日趋势
  const dailyQuery = `
    SELECT
      strftime('%Y-%m-%d', created) AS date,
      SUM(CASE WHEN status = 'settled' THEN totalAmount ELSE 0 END) AS revenue,
      SUM(CASE WHEN status = 'settled' THEN 1 ELSE 0 END) AS count
    FROM orders
    ${where}
    GROUP BY date
    ORDER BY date ASC
  `

  // 3. 24小时时段分布
  const hourlyQuery = `
    SELECT
      CAST(strftime('%H', created) AS INTEGER) AS hour,
      SUM(CASE WHEN status = 'settled' THEN 1 ELSE 0 END) AS count,
      SUM(CASE WHEN status = 'settled' THEN totalAmount ELSE 0 END) AS revenue
    FROM orders
    ${where}
    GROUP BY hour
    ORDER BY hour ASC
  `

  // 4. 状态分布
  const statusQuery = `
    SELECT
      status,
      COUNT(*) AS count
    FROM orders
    ${where}
    GROUP BY status
  `

  // 5. 桌位排行
  const tableQuery = `
    SELECT
      tableNo,
      SUM(CASE WHEN status = 'settled' THEN totalAmount ELSE 0 END) AS revenue,
      SUM(CASE WHEN status = 'settled' THEN 1 ELSE 0 END) AS count
    FROM orders
    ${where}
    GROUP BY tableNo
    ORDER BY revenue DESC
    LIMIT 50
  `

  // 6. 热门菜品（通过 json_each 展开 items）
  const dishesQuery = `
    SELECT
      json_extract(value, '$.name') AS name,
      SUM(COALESCE(json_extract(value, '$.quantity'), 0)) AS quantity,
      SUM(
        ROUND(
          COALESCE(json_extract(value, '$.price'), 0)
          * COALESCE(json_extract(value, '$.quantity'), 0)
          * 100
        ) / 100.0
      ) AS revenue
    FROM orders, json_each(COALESCE(items, '[]'))
    ${where}
    AND status = 'settled'
    AND json_extract(value, '$.name') IS NOT NULL
    GROUP BY name
    ORDER BY quantity DESC
    LIMIT 50
  `

  const db = $app.dao().db()

  function exec(query) {
    try {
      const rows = db.newQuery(query).execute()
      const result = []
      while (rows.next()) {
        const obj = {}
        const cols = rows.columnNames()
        for (const col of cols) {
          obj[col] = rows.get(col)
        }
        result.push(obj)
      }
      return result
    } catch (e) {
      console.error('stats query error:', e, 'query:', query)
      return []
    }
  }

  const summary = exec(summaryQuery)[0] || {
    totalOrders: 0,
    totalRevenue: 0,
    settledOrders: 0,
    completedOrders: 0,
    cancelledOrders: 0,
  }

  // 将 totalRevenue 等转为 number（SQLite 可能返回 string）
  const toNum = (v) => (typeof v === 'number' ? v : Number(v || 0))

  return c.json(200, {
    totalOrders: toNum(summary.totalOrders),
    totalRevenue: toNum(summary.totalRevenue),
    settledOrders: toNum(summary.settledOrders),
    completedOrders: toNum(summary.completedOrders),
    cancelledOrders: toNum(summary.cancelledOrders),
    averageOrderValue: toNum(summary.settledOrders) > 0 ? toNum(summary.totalRevenue) / toNum(summary.settledOrders) : 0,
    daily: exec(dailyQuery),
    hourly: exec(hourlyQuery),
    status: exec(statusQuery),
    tables: exec(tableQuery),
    dishes: exec(dishesQuery),
  })
})
