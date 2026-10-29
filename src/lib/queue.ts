import { db } from './db'
import { getScheduler, isLiveCard, isLiveLog, retrievability, State } from './srs'
import { getSettings } from './settings'
import { dayKey, endOfStudyDay } from './time'
import type { Book, CardRecord, Settings } from './types'

/** 学习步中的词，提前这么久可以拿出来 */
const LEARN_AHEAD_MS = 20 * 60_000

export type Kind = 'new' | 'learn' | 'review'
export interface QueueItem {
  k: string
  kind: Kind
}

export interface TodayCounts {
  review: number
  learn: number
  newAvail: number
  newDone: number
  reviewDone: number
  totalDone: number
}

async function activeBooks(settings: Settings): Promise<Book[]> {
  const books = await db.books.bulkGet(settings.activeBooks)
  return books.filter((b): b is Book => !!b && !b.deleted)
}

/** 今天已经学过的新词数、复习数 */
async function todayDone(): Promise<{ newDone: number; reviewDone: number; total: number }> {
  const logs = (await db.logs.where('day').equals(dayKey()).toArray()).filter(isLiveLog)
  return {
    newDone: logs.filter((l) => l.prevState === State.New).length,
    reviewDone: logs.filter((l) => l.prevState === State.Review).length,
    total: logs.length,
  }
}

/** 从激活的词书中挑出还没学过的新词 */
async function pickNew(settings: Settings, limit: number, exclude: Set<string>): Promise<string[]> {
  if (limit <= 0) return []
  const books = await activeBooks(settings)
  const out: string[] = []
  const seen = new Set(exclude)
  for (const b of books) {
    let words = b.words
    if (settings.newOrder === 'random') words = shuffleStable(words, dayKey())
    // 分批查询卡片，避免一次读取整本书
    for (let i = 0; i < words.length && out.length < limit; i += 200) {
      const batch = words.slice(i, i + 200)
      const cards = await db.cards.bulkGet(batch)
      batch.forEach((k, j) => {
        if (out.length >= limit || seen.has(k)) return
        const c = cards[j]
        if (isLiveCard(c) && (c.state !== State.New || c.suspended)) return
        seen.add(k)
        out.push(k)
      })
    }
    if (out.length >= limit) break
  }
  return out
}

/** 同一天内顺序固定的伪随机洗牌，避免每次打开顺序都变 */
function shuffleStable<T>(arr: T[], seed: string): T[] {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function dueCards(now: number): Promise<{ review: CardRecord[]; learn: CardRecord[] }> {
  const end = endOfStudyDay(now)
  const due = (await db.cards.where('due').belowOrEqual(end).toArray()).filter(
    (c) => isLiveCard(c) && !c.suspended && c.state !== State.New,
  )
  return {
    review: due.filter((c) => c.state === State.Review),
    learn: due.filter((c) => c.state === State.Learning || c.state === State.Relearning),
  }
}

export async function todayCounts(now = Date.now()): Promise<TodayCounts> {
  const settings = await getSettings()
  const [{ review, learn }, done] = await Promise.all([dueCards(now), todayDone()])
  const newAvail = (await pickNew(settings, Math.max(0, settings.dailyNew - done.newDone), new Set())).length
  return {
    review: Math.min(review.length, Math.max(0, settings.maxReviews - done.reviewDone)),
    learn: learn.length,
    newAvail,
    newDone: done.newDone,
    reviewDone: done.reviewDone,
    totalDone: done.total,
  }
}

/**
 * 一次学习会话的队列。
 * - 到期复习按可提取性从低到高排（最容易忘的先复习）
 * - 新词按比例穿插在复习之间，而不是全堆在最后
 * - 学习步中的词（1 分钟 / 10 分钟后再见）放在单独的队列，到点就插队
 */
export class StudySession {
  private main: QueueItem[] = []
  private learning: { k: string; due: number }[] = []
  private extraNewAllowed = false

  static async create(opts: { extraNew?: number } = {}): Promise<StudySession> {
    const s = new StudySession()
    await s.build(opts.extraNew ?? 0)
    return s
  }

  private async build(extraNew: number) {
    const now = Date.now()
    const settings = await getSettings()
    const scheduler = await getScheduler(settings.retention)
    const [{ review, learn }, done] = await Promise.all([dueCards(now), todayDone()])

    const reviewQuota = Math.max(0, settings.maxReviews - done.reviewDone)
    const reviews = review
      .map((c) => ({ c, r: retrievability(scheduler, c.fsrs, now) }))
      .sort((a, b) => a.r - b.r)
      .slice(0, reviewQuota)
      .map(({ c }) => c.k)

    const newQuota = Math.max(0, settings.dailyNew - done.newDone) + extraNew
    this.extraNewAllowed = extraNew > 0
    const exclude = new Set([...reviews, ...learn.map((c) => c.k)])
    const news = await pickNew(settings, newQuota, exclude)

    this.learning = learn.map((c) => ({ k: c.k, due: c.due })).sort((a, b) => a.due - b.due)
    this.main = interleave(reviews, news)
  }

  get hasExtraNew() {
    return this.extraNewAllowed
  }

  counts(): Record<Kind, number> {
    return {
      new: this.main.filter((i) => i.kind === 'new').length,
      review: this.main.filter((i) => i.kind === 'review').length,
      learn: this.learning.length,
    }
  }

  get remaining() {
    return this.main.length + this.learning.length
  }

  /** 取下一张卡（不出队） */
  peek(now = Date.now()): QueueItem | null {
    const l = this.learning[0]
    if (l && l.due <= now) return { k: l.k, kind: 'learn' }
    if (this.main.length) return this.main[0]
    if (l && l.due <= now + LEARN_AHEAD_MS) return { k: l.k, kind: 'learn' }
    return null
  }

  /** 只剩还没到点的学习步卡片时，提前拿出最早的一张 */
  peekAhead(): QueueItem | null {
    const l = this.learning[0]
    return l ? { k: l.k, kind: 'learn' } : null
  }

  /** 答完一张卡后更新队列 */
  answered(item: QueueItem, card: CardRecord) {
    if (item.kind === 'learn') this.learning = this.learning.filter((l) => l.k !== item.k)
    else this.main = this.main.filter((m) => m.k !== item.k)
    const inLearning = card.state === State.Learning || card.state === State.Relearning
    if (inLearning && card.due <= endOfStudyDay()) {
      this.learning.push({ k: card.k, due: card.due })
      this.learning.sort((a, b) => a.due - b.due)
    }
  }

  /** 撤销：把卡片放回队首 */
  restore(item: QueueItem) {
    this.learning = this.learning.filter((l) => l.k !== item.k)
    if (item.kind === 'learn') this.learning.unshift({ k: item.k, due: 0 })
    else this.main.unshift(item)
  }

  /** 斩掉当前词：直接出队 */
  drop(item: QueueItem) {
    this.learning = this.learning.filter((l) => l.k !== item.k)
    this.main = this.main.filter((m) => m.k !== item.k)
  }

  /** 学习步中最早一张卡的到期时间 */
  nextLearnDue(): number | null {
    return this.learning[0]?.due ?? null
  }
}

/** 按比例把新词均匀插入复习序列 */
export function interleave(reviews: string[], news: string[]): QueueItem[] {
  const out: QueueItem[] = []
  const r = reviews.map((k) => ({ k, kind: 'review' as const }))
  const n = news.map((k) => ({ k, kind: 'new' as const }))
  if (!n.length) return r
  if (!r.length) return n
  const step = (r.length + n.length) / n.length
  let ri = 0
  let ni = 0
  for (let i = 0; i < r.length + n.length; i++) {
    // 让第 j 个新词落在 j*step 附近的位置
    const wantNew = ni < n.length && (ri >= r.length || i + 1 >= (ni + 0.5) * step)
    out.push(wantNew ? n[ni++] : r[ri++])
  }
  return out
}
