import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { IconCheck, IconClose, IconScissors, IconSpeaker, IconUndo } from '../components/Icons'
import { ProgressRing, toast } from '../components/ui'
import { formatPhonetic, Meaning } from '../components/WordView'
import { db } from '../lib/db'
import { haptic } from '../lib/haptics'
import { StudySession, type QueueItem } from '../lib/queue'
import { goBack, navigate, useRoute } from '../lib/router'
import { previewIntervals, reviewWord, setSuspended, undoReview, type Grade, type ReviewResult } from '../lib/srs'
import { getSettings, useSettings } from '../lib/settings'
import { formatInterval } from '../lib/time'
import { speak, stopSpeaking } from '../lib/tts'
import type { CardRecord, WordEntry } from '../lib/types'

type Phase = 'loading' | 'card' | 'waiting' | 'done'

const GRADES: { grade: Grade; label: string; color: string; key: string }[] = [
  { grade: 1, label: '重来', color: 'var(--red)', key: '1' },
  { grade: 2, label: '困难', color: 'var(--orange)', key: '2' },
  { grade: 3, label: '良好', color: 'var(--green)', key: '3' },
  { grade: 4, label: '简单', color: 'var(--blue)', key: '4' },
]

const KIND_LABEL = { new: '新词', learn: '学习中', review: '复习' } as const
const SWIPE = 110

export default function Study() {
  const route = useRoute()
  const settings = useSettings()
  const extra = Number(new URLSearchParams(route.split('?')[1] ?? '').get('extra') ?? 0)

  const session = useRef<StudySession | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [item, setItem] = useState<QueueItem | null>(null)
  const [entry, setEntry] = useState<WordEntry | null>(null)
  const [card, setCard] = useState<CardRecord | undefined>()
  const [revealed, setRevealed] = useState(false)
  const [intervals, setIntervals] = useState<Record<Grade, number> | null>(null)
  const [history, setHistory] = useState<{ item: QueueItem; result: ReviewResult }[]>([])
  const [done, setDone] = useState(0)
  const [seq, setSeq] = useState(0)
  const [exitDir, setExitDir] = useState(1)
  const shownAt = useRef(Date.now())
  const busy = useRef(false)

  const show = useCallback(async (next: QueueItem) => {
    const [e, c] = await Promise.all([db.words.get(next.k), db.cards.get(next.k)])
    if (!e) {
      // 词条缺失（例如同步过来的词书还没下载完），跳过
      session.current?.drop(next)
      return false
    }
    setItem(next)
    setEntry(e)
    setCard(c)
    setRevealed(false)
    setIntervals(null)
    setSeq((s) => s + 1)
    setPhase('card')
    shownAt.current = Date.now()
    previewIntervals(c && c.state >= 0 ? c.fsrs : null).then(setIntervals)
    const s = await getSettings()
    if (s.autoSpeak && s.direction === 'en-zh') speak(e.w)
    return true
  }, [])

  const advance = useCallback(
    async (opts: { ahead?: boolean } = {}) => {
      const s = session.current
      if (!s) return
      for (let guard = 0; guard < 50; guard++) {
        const next = opts.ahead ? s.peekAhead() : s.peek()
        if (!next) break
        if (await show(next)) return
      }
      stopSpeaking()
      setItem(null)
      setPhase(s.remaining > 0 ? 'waiting' : 'done')
    },
    [show],
  )

  useEffect(() => {
    let alive = true
    StudySession.create({ extraNew: extra }).then((s) => {
      if (!alive) return
      session.current = s
      void advance()
    })
    return () => {
      alive = false
      stopSpeaking()
    }
  }, [extra, advance])

  // 等待学习步到期时，定时检查
  useEffect(() => {
    if (phase !== 'waiting') return
    const t = setInterval(() => session.current?.peek() && void advance(), 5000)
    return () => clearInterval(t)
  }, [phase, advance])

  const reveal = useCallback(() => {
    if (!entry || revealed) return
    haptic()
    setRevealed(true)
    if (settings.autoSpeak && settings.direction === 'zh-en') speak(entry.w)
  }, [entry, revealed, settings.autoSpeak, settings.direction])

  const answer = useCallback(
    async (grade: Grade) => {
      if (!item || !revealed || busy.current) return
      busy.current = true
      try {
        const result = await reviewWord(item.k, grade, Date.now() - shownAt.current)
        session.current?.answered(item, result.card)
        setHistory((h) => [...h.slice(-49), { item, result }])
        setDone((d) => d + 1)
        setExitDir(grade === 1 ? -1 : 1)
        haptic(grade === 1 ? 'warning' : 'light')
        await advance()
      } finally {
        busy.current = false
      }
    },
    [item, revealed, advance],
  )

  const undo = useCallback(async () => {
    const last = history[history.length - 1]
    if (!last || busy.current) return
    busy.current = true
    try {
      await undoReview(last.result)
      setHistory((h) => h.slice(0, -1))
      setDone((d) => Math.max(0, d - 1))
      session.current?.restore(last.item)
      setExitDir(-1)
      await show(last.item)
      haptic()
    } finally {
      busy.current = false
    }
  }, [history, show])

  const suspend = useCallback(async () => {
    if (!item || !entry) return
    await setSuspended(item.k, true)
    session.current?.drop(item)
    haptic('success')
    toast(`已斩「${entry.w}」`)
    setExitDir(1)
    await advance()
  }, [item, entry, advance])

  const close = useCallback(() => {
    stopSpeaking()
    goBack('/today')
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        void undo()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') return close()
      if (phase !== 'card') return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (revealed) void answer(3)
        else reveal()
      } else if (revealed && /^[1-4]$/.test(e.key)) {
        void answer(Number(e.key) as Grade)
      } else if (e.key.toLowerCase() === 'r' && entry) {
        speak(entry.w)
      } else if (e.key.toLowerCase() === 'z') {
        void undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, revealed, entry, answer, reveal, undo, close])

  const counts = session.current?.counts() ?? { new: 0, learn: 0, review: 0 }
  const total = done + (session.current?.remaining ?? 0)

  return (
    <motion.div
      className="study"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 36 }}
    >
      <div className="backdrop" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <header className="study-top">
        <button className="icon-btn glass" aria-label="结束学习" onClick={close}>
          <IconClose />
        </button>
        <div className="study-counts glass">
          <span className={item?.kind === 'new' ? 'on' : ''} style={{ color: 'var(--blue)' }}>
            {counts.new}
          </span>
          <span className={item?.kind === 'learn' ? 'on' : ''} style={{ color: 'var(--orange)' }}>
            {counts.learn}
          </span>
          <span className={item?.kind === 'review' ? 'on' : ''} style={{ color: 'var(--green)' }}>
            {counts.review}
          </span>
        </div>
        <button className="icon-btn glass" aria-label="撤销" disabled={!history.length} onClick={undo}>
          <IconUndo />
        </button>
      </header>
      <div className="study-progress">
        <i style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>

      <div className="study-stage">
        {phase === 'loading' && <div className="spinner" />}
        {phase === 'card' && entry && item && (
          <AnimatePresence mode="popLayout" custom={exitDir} initial={false}>
            <StudyCard
              key={seq}
              entry={entry}
              item={item}
              card={card}
              revealed={revealed}
              direction={settings.direction}
              showEnglish={settings.showEnglish}
              exitDir={exitDir}
              onReveal={reveal}
              onSwipe={(g) => answer(g)}
              onSuspend={suspend}
            />
          </AnimatePresence>
        )}
        {phase === 'waiting' && <Waiting session={session.current!} onAhead={() => advance({ ahead: true })} onClose={close} />}
        {phase === 'done' && <Done count={done} onClose={close} />}
      </div>

      {phase === 'card' && (
        <footer className="study-actions">
          {!revealed ? (
            <button className="btn reveal-btn glass" onClick={reveal}>
              显示答案
              <kbd>空格</kbd>
            </button>
          ) : (
            <div className="grades">
              {GRADES.map((g) => (
                <button key={g.grade} className="grade glass" style={{ '--c': g.color } as React.CSSProperties} onClick={() => answer(g.grade)}>
                  <span className="grade-label">{g.label}</span>
                  <span className="grade-ivl">{intervals ? formatInterval(intervals[g.grade]) : '…'}</span>
                  <kbd>{g.key}</kbd>
                </button>
              ))}
            </div>
          )}
        </footer>
      )}
    </motion.div>
  )
}

function StudyCard(props: {
  entry: WordEntry
  item: QueueItem
  card?: CardRecord
  revealed: boolean
  direction: 'en-zh' | 'zh-en'
  showEnglish: boolean
  exitDir: number
  onReveal: () => void
  onSwipe: (g: Grade) => void
  onSuspend: () => void
}) {
  const { entry, revealed } = props
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-240, 240], [-8, 8])
  const goodOpacity = useTransform(x, [20, SWIPE], [0, 1])
  const againOpacity = useTransform(x, [-SWIPE, -20], [1, 0])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > SWIPE || info.velocity.x > 700) props.onSwipe(3)
    else if (info.offset.x < -SWIPE || info.velocity.x < -700) props.onSwipe(1)
  }

  const showWord = props.direction === 'en-zh' || revealed
  const lapses = props.card && props.card.state >= 0 ? props.card.fsrs.lapses : 0

  return (
    <motion.article
      className="study-card"
      custom={props.exitDir}
      variants={{
        enter: { opacity: 0, scale: 0.94, y: 16 },
        center: { opacity: 1, scale: 1, y: 0, x: 0 },
        exit: (dir: number) => ({ opacity: 0, x: dir * 320, rotate: dir * 6, transition: { duration: 0.28 } }),
      }}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      style={{ x, rotate }}
      drag={revealed ? 'x' : false}
      dragSnapToOrigin
      dragElastic={0.7}
      onDragEnd={onDragEnd}
      onClick={() => !revealed && props.onReveal()}
    >
      <motion.div className="swipe-hint good" style={{ opacity: goodOpacity }}>
        良好
      </motion.div>
      <motion.div className="swipe-hint again" style={{ opacity: againOpacity }}>
        重来
      </motion.div>

      <div className="card-meta">
        <span className={`badge ${props.item.kind === 'new' ? 'blue' : props.item.kind === 'learn' ? 'orange' : 'green'}`}>
          {KIND_LABEL[props.item.kind]}
        </span>
        {lapses > 1 && <span className="badge red">忘过 {lapses} 次</span>}
        <span className="spacer" />
        <button
          className="icon-btn"
          aria-label="斩：我已经认识"
          title="斩：我已经认识"
          onClick={(e) => {
            e.stopPropagation()
            props.onSuspend()
          }}
        >
          <IconScissors />
        </button>
      </div>

      <div className="card-body">
        {showWord ? (
          <div className="card-word">
            <h2 className={entry.w.length > 14 ? 'long' : ''}>{entry.w}</h2>
            <button
              className="phonetic-btn"
              onClick={(e) => {
                e.stopPropagation()
                speak(entry.w)
              }}
            >
              {entry.p && <span>{formatPhonetic(entry.p)}</span>}
              <IconSpeaker width={20} height={20} />
            </button>
          </div>
        ) : (
          <div className="card-prompt">
            <div className="muted small" style={{ marginBottom: 10 }}>
              想想这个意思对应哪个单词
            </div>
            <Meaning entry={{ ...entry, x: undefined }} />
          </div>
        )}

        <AnimatePresence initial={false}>
          {revealed && (
            <motion.div
              className="card-answer"
              initial={{ opacity: 0, y: 12, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            >
              {props.direction === 'en-zh' ? <Meaning entry={entry} showEnglish={props.showEnglish} /> : <Meaning entry={{ ...entry, t: '' }} showEnglish={props.showEnglish} />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!revealed && <div className="tap-hint">轻点卡片显示答案</div>}
      {revealed && <div className="tap-hint">← 左滑重来 · 右滑良好 →</div>}
    </motion.article>
  )
}

function Waiting({ session, onAhead, onClose }: { session: StudySession; onAhead: () => void; onClose: () => void }) {
  const due = session.nextLearnDue()
  const mins = due ? Math.max(1, Math.round((due - Date.now()) / 60_000)) : 0
  return (
    <motion.div className="study-end" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
      <ProgressRing value={0.85} size={110} stroke={10} color="var(--orange)">
        <span style={{ fontSize: 28, fontWeight: 700 }}>{session.remaining}</span>
      </ProgressRing>
      <h2>先休息一下</h2>
      <p className="muted">
        还有 {session.remaining} 个词在学习步中，约 {mins} 分钟后再复习效果最好。
        <br />
        保持页面打开，到点会自动出现。
      </p>
      <div className="stack" style={{ width: '100%', maxWidth: 360 }}>
        <button className="btn btn-tinted btn-block" onClick={onAhead}>
          现在就复习
        </button>
        <button className="btn btn-gray btn-block" onClick={onClose}>
          稍后回来
        </button>
      </div>
    </motion.div>
  )
}

function Done({ count, onClose }: { count: number; onClose: () => void }) {
  return (
    <motion.div className="study-end" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}>
      <ProgressRing value={1} size={110} stroke={10} color="var(--green)">
        <IconCheck width={44} height={44} style={{ color: 'var(--green)' }} />
      </ProgressRing>
      <h2>今天的任务完成了</h2>
      <p className="muted">本次学习 {count} 次。明天按时回来，记忆曲线才会生效。</p>
      <div className="stack" style={{ width: '100%', maxWidth: 360 }}>
        <button className="btn btn-primary btn-block" onClick={onClose}>
          完成
        </button>
        <button className="btn btn-tinted btn-block" onClick={() => navigate('/study?extra=10', true)}>
          再学 10 个新词
        </button>
      </div>
    </motion.div>
  )
}
