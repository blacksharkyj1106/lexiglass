import { db } from './db'
import { isLiveCard, isLiveLog, State } from './srs'
import { addDays, dayKey, endOfStudyDay } from './time'

export interface Stats {
  /** 每天的复习次数 */
  daily: Map<string, number>
  streak: number
  totalReviews: number
  /** 近 30 天复习卡片（不含新词、学习步）回答正确的比例 */
  retention: number | null
  counts: { new: number; learning: number; young: number; mature: number; suspended: number }
  /** 未来 N 天每天到期数，[0] 为今天（含已逾期） */
  forecast: number[]
  todayMinutes: number
}

export async function computeStats(forecastDays = 30): Promise<Stats> {
  const [logs, cards] = await Promise.all([db.logs.toArray(), db.cards.toArray()])
  const live = logs.filter(isLiveLog)

  const daily = new Map<string, number>()
  for (const l of live) daily.set(l.day, (daily.get(l.day) ?? 0) + 1)

  const today = dayKey()
  let streak = 0
  // 今天还没学不算断
  let d = daily.has(today) ? today : addDays(today, -1)
  while (daily.has(d)) {
    streak++
    d = addDays(d, -1)
  }

  const since = addDays(today, -30)
  const recent = live.filter((l) => l.day > since && l.prevState === State.Review)
  const retention = recent.length >= 10 ? recent.filter((l) => l.rating > 1).length / recent.length : null

  const counts = { new: 0, learning: 0, young: 0, mature: 0, suspended: 0 }
  const forecast = new Array(forecastDays).fill(0)
  const end0 = endOfStudyDay()
  for (const c of cards) {
    if (!isLiveCard(c)) continue
    if (c.suspended) {
      counts.suspended++
      continue
    }
    if (c.state === State.New) counts.new++
    else if (c.state === State.Learning || c.state === State.Relearning) counts.learning++
    else if (c.fsrs.scheduledDays >= 21) counts.mature++
    else counts.young++
    if (c.state !== State.New) {
      const idx = c.due <= end0 ? 0 : Math.ceil((c.due - end0) / 86_400_000)
      if (idx < forecastDays) forecast[idx]++
    }
  }

  const todayMinutes = Math.round(live.filter((l) => l.day === today).reduce((s, l) => s + l.ms, 0) / 60_000)

  return { daily, streak, totalReviews: live.length, retention, counts, forecast, todayMinutes }
}

/** 每本词书的进度：已学（非新词）/ 总数 */
export async function bookProgress(words: string[]): Promise<{ learned: number; mature: number; total: number }> {
  let learned = 0
  let mature = 0
  for (let i = 0; i < words.length; i += 500) {
    const cards = await db.cards.bulkGet(words.slice(i, i + 500))
    for (const c of cards) {
      if (!isLiveCard(c)) continue
      if (c.suspended || c.state !== State.New) learned++
      if (c.suspended || c.fsrs.scheduledDays >= 21) mature++
    }
  }
  return { learned, mature, total: words.length }
}
