/** 学习日以凌晨 4 点为界，熬夜背的词算前一天 */
export const DAY_START_HOUR = 4
const DAY = 86_400_000

const pad = (n: number) => String(n).padStart(2, '0')

export function dayKey(ts: number = Date.now()): string {
  const d = new Date(ts - DAY_START_HOUR * 3_600_000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 当前学习日结束的时间戳（下一个凌晨 4 点） */
export function endOfStudyDay(ts: number = Date.now()): number {
  const d = new Date(ts - DAY_START_HOUR * 3_600_000)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 1)
  return d.getTime() + DAY_START_HOUR * 3_600_000
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d + n, 12)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 间隔的人类可读表示：1 分钟 / 10 分钟 / 3 天 / 2 个月 */
export function formatInterval(ms: number): string {
  const min = ms / 60_000
  if (min < 1) return '<1 分钟'
  if (min < 60) return `${Math.round(min)} 分钟`
  const h = min / 60
  if (h < 24) return `${Math.round(h)} 小时`
  const d = ms / DAY
  if (d < 30) return `${Math.round(d)} 天`
  if (d < 365) return `${+(d / 30).toFixed(1)} 个月`
  return `${+(d / 365).toFixed(1)} 年`
}

export function formatRelativeDue(due: number, now = Date.now()): string {
  const diff = due - now
  if (diff <= 0) return '已到期'
  return `${formatInterval(diff)}后`
}

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
