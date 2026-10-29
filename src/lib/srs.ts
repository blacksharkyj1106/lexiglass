import { DefaultScheduler, Rating, State } from 'ts-fsrs'
import { db } from './db'
import { getSettings } from './settings'
import { dayKey, uid } from './time'
import type { CardRecord, FsrsData, ReviewLogRecord } from './types'

export { Rating, State }
export type Grade = 1 | 2 | 3 | 4

type Scheduler = Awaited<ReturnType<typeof DefaultScheduler<'FSRS-7'>>>
type FsrsCard = ReturnType<Scheduler['newCard']>

const schedulers = new Map<number, Promise<Scheduler>>()

/** 按目标保持率缓存调度器 */
export function getScheduler(retention: number): Promise<Scheduler> {
  let s = schedulers.get(retention)
  if (!s) {
    s = DefaultScheduler({
      version: 'FSRS-7',
      desiredRetention: retention,
      enableFuzz: true,
      enableShortTerm: true,
      learningSteps: ['1m', '10m'],
      relearningSteps: ['10m'],
      // 新词即使答「良好」也要先走完 10 分钟的学习步，不直接跳到几天后
      allowModelOverride: false,
      maximumInterval: 3650,
    })
    schedulers.set(retention, s)
  }
  return s
}

function toFsrs(d: FsrsData): FsrsCard {
  return {
    ...d,
    dueAt: new Date(d.dueAt),
    lastReviewAt: d.lastReviewAt == null ? null : new Date(d.lastReviewAt),
  } as unknown as FsrsCard
}

function fromFsrs(c: FsrsCard): FsrsData {
  const raw = c as unknown as Record<string, unknown>
  const due = raw.dueAt as Date
  const last = raw.lastReviewAt as Date | null
  return {
    stability: raw.stability as number,
    stabilityFast: (raw.stabilityFast as number) ?? 0,
    difficulty: raw.difficulty as number,
    dueAt: due.getTime(),
    lastReviewAt: last ? last.getTime() : null,
    state: raw.state as number,
    scheduleStatus: raw.scheduleStatus as string,
    cardId: raw.cardId as string,
    reps: raw.reps as number,
    lapses: raw.lapses as number,
    scheduledDays: raw.scheduledDays as number,
    learningStep: raw.learningStep as number,
  }
}

export async function newCardData(now = Date.now()): Promise<FsrsData> {
  const s = await getScheduler(0.9)
  return fromFsrs(s.newCard({ now: new Date(now) }))
}

/** 当前可提取性（还记得的概率），新词返回 0 */
export function retrievability(s: Scheduler, card: FsrsData, now = Date.now()): number {
  if (card.state === State.New || card.lastReviewAt == null) return 0
  const elapsed = Math.max(0, s.chrono.difference(new Date(card.lastReviewAt), new Date(now)))
  return s.model.forgettingCurve(toFsrs(card) as never, elapsed)
}

/** 四个评分各自的下次复习时间 */
export async function previewIntervals(card: FsrsData | null, now = Date.now()): Promise<Record<Grade, number>> {
  const { retention } = await getSettings()
  const s = await getScheduler(retention)
  const base = card ? toFsrs(card) : s.newCard({ now: new Date(now) })
  const out = {} as Record<Grade, number>
  for (const p of s.preview({ card: base, now: new Date(now) })) {
    out[p.grade as Grade] = (p.card as unknown as { dueAt: Date }).dueAt.getTime() - now
  }
  return out
}

export interface ReviewResult {
  card: CardRecord
  log: ReviewLogRecord
  /** 用于撤销 */
  prev: CardRecord | undefined
}

export async function reviewWord(k: string, grade: Grade, ms: number, now = Date.now()): Promise<ReviewResult> {
  const { retention } = await getSettings()
  const s = await getScheduler(retention)
  return db.transaction('rw', db.cards, db.logs, async () => {
    const prev = await db.cards.get(k)
    const base = prev ? toFsrs(prev.fsrs) : s.newCard({ now: new Date(now) })
    const r = s.review({ card: base, grade, now: new Date(now) })
    const fsrs = fromFsrs(r.card)
    const card: CardRecord = {
      k,
      due: fsrs.dueAt,
      state: fsrs.state,
      suspended: 0,
      fsrs,
      updatedAt: now,
      dirty: 1,
    }
    const log: ReviewLogRecord = {
      id: uid(),
      k,
      rating: grade,
      prevState: prev?.state ?? State.New,
      at: now,
      day: dayKey(now),
      ms: Math.min(ms, 120_000),
      updatedAt: now,
      dirty: 1,
    }
    await db.cards.put(card)
    await db.logs.put(log)
    return { card, log, prev }
  })
}

/** 撤销一次评分：还原卡片并删除对应日志（日志以墓碑形式同步删除） */
export async function undoReview(r: ReviewResult) {
  const now = Date.now()
  await db.transaction('rw', db.cards, db.logs, async () => {
    if (r.prev) await db.cards.put({ ...r.prev, updatedAt: now, dirty: 1 })
    else await db.cards.put({ ...r.card, ...TOMBSTONE_CARD(r.card.k), updatedAt: now, dirty: 1 })
    await db.logs.put({ ...r.log, rating: 0, updatedAt: now, dirty: 1 })
  })
}

/** 「删除」用 state=-1 表示，便于同步到其他设备 */
const TOMBSTONE_CARD = (k: string): Partial<CardRecord> => ({ k, state: -1, due: Number.MAX_SAFE_INTEGER })

export const isLiveCard = (c: CardRecord | undefined): c is CardRecord => !!c && c.state >= 0
export const isLiveLog = (l: ReviewLogRecord) => l.rating > 0

/** 斩：标记为熟知 */
export async function setSuspended(k: string, suspended: boolean) {
  const now = Date.now()
  const cur = await db.cards.get(k)
  const fsrs = cur && isLiveCard(cur) ? cur.fsrs : await newCardData(now)
  await db.cards.put({
    k,
    due: fsrs.dueAt,
    state: fsrs.state,
    fsrs,
    suspended: suspended ? 1 : 0,
    updatedAt: now,
    dirty: 1,
  })
}

/** 重置进度：回到未学状态 */
export async function resetCard(k: string) {
  const now = Date.now()
  const cur = await db.cards.get(k)
  if (!cur) return
  await db.cards.put({ ...cur, ...TOMBSTONE_CARD(k), suspended: 0, updatedAt: now, dirty: 1 })
}
