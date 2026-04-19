export const DISH_RULES: Record<string, { add: string; qty: number }> = {
  '铁锅鱼': { add: '锅底', qty: 1 },
  '铁锅炖鱼': { add: '锅底', qty: 1 },
}

export const HOT_DISHES: Set<string> = new Set(['铁锅鱼', '锅底', '铁锅鸡', '铁锅排骨', '铁锅炖鱼'])

export const CATEGORY_ORDER: string[] = [
  '铁锅炖',
  '特色菜',
  '农家小炒',
  '凉菜',
  '特色豆腐',
  '主食',
  '酒水',
]

export const CATEGORY_META: Record<string, { icon: string; gradient: string }> = {
  '铁锅炖': { icon: '🔥', gradient: 'from-red-500 to-orange-500' },
  '特色菜': { icon: '⭐', gradient: 'from-amber-500 to-yellow-500' },
  '农家小炒': { icon: '🥬', gradient: 'from-green-500 to-emerald-500' },
  '凉菜': { icon: '🥗', gradient: 'from-cyan-500 to-blue-500' },
  '特色豆腐': { icon: '🧈', gradient: 'from-yellow-400 to-orange-400' },
  '主食': { icon: '🍚', gradient: 'from-stone-400 to-stone-500' },
  '酒水': { icon: '🍺', gradient: 'from-indigo-500 to-purple-500' },
}
