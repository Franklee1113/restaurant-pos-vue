import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getPocketBase } from '../plugins/pocketbase'

const STATE_FILE = join(process.cwd(), '.soldout-reset-state')

function getLastRunDate(): string {
  try {
    if (existsSync(STATE_FILE)) {
      return readFileSync(STATE_FILE, 'utf-8').trim()
    }
  } catch { /* ignore */ }
  return ''
}

function setLastRunDate(date: string): void {
  try {
    writeFileSync(STATE_FILE, date)
  } catch { /* ignore */ }
}

export function startSoldOutResetJob(): void {
  // 每分钟检查一次
  setInterval(async () => {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const lastRun = getLastRunDate()

    // 今天已经执行过，跳过
    if (lastRun === today) return

    // 未到 04:00，跳过
    if (now.getHours() !== 4) return

    const pb = getPocketBase()
    try {
      const soldOutDishes = await pb.collection('dishes').getFullList({
        filter: 'soldOut = true',
      })

      for (const dish of soldOutDishes) {
        await pb.collection('dishes').update(dish.id, {
          soldOut: false,
          soldOutNote: '',
          soldOutAt: null,
        })
      }

      setLastRunDate(today)
      console.log(`[AutoReset] ${soldOutDishes.length} 道菜品已自动恢复售卖`)
    } catch (err) {
      console.error('[AutoReset] 自动重置失败:', err)
      // 失败不写入 lastRun，下次会重试
    }
  }, 60_000)
}
