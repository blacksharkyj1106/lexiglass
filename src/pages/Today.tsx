import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { IconBolt, IconBooks, IconCheck, IconFlame, IconInfo, IconPlus, IconUpload } from '../components/Icons'
import { NavBar, ProgressRing, Section, toast } from '../components/ui'
import { addBuiltinBook, builtinManifest } from '../lib/books'
import { db } from '../lib/db'
import { haptic } from '../lib/haptics'
import { todayCounts } from '../lib/queue'
import { navigate } from '../lib/router'
import { useSettings } from '../lib/settings'
import { bookProgress, computeStats } from '../lib/stats'
import { isStandalone } from './Settings'

const WEEK = ['日', '一', '二', '三', '四', '五', '六']

export default function Today() {
  const settings = useSettings()
  const counts = useLiveQuery(() => todayCounts(), [settings])
  const stats = useLiveQuery(() => computeStats(1), [])
  const books = useLiveQuery(async () => {
    const list = (await db.books.bulkGet(settings.activeBooks)).filter((b) => b && !b.deleted)
    return Promise.all(list.map(async (b) => ({ book: b!, progress: await bookProgress(b!.words) })))
  }, [settings.activeBooks])

  const now = new Date()
  const subtitle = `${now.getMonth() + 1}月${now.getDate()}日 星期${WEEK[now.getDay()]}`

  const remaining = counts ? counts.newAvail + counts.learn + counts.review : 0
  const done = counts?.totalDone ?? 0
  const progress = done + remaining ? done / (done + remaining) : 0
  const noBooks = books && books.length === 0

  // Mac / iPad 键盘：空格开始学习
  useEffect(() => {
    if (!remaining) return
    const onKey = (e: KeyboardEvent) => {
      if (location.hash.startsWith('#/study') || e.key !== ' ' || e.metaKey || e.ctrlKey || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      e.preventDefault()
      navigate('/study')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [remaining])

  return (
    <>
      <NavBar title="今日" large subtitle={subtitle} />
      <div className="page">
        {!isStandalone() && /iPhone|iPad|Macintosh/.test(navigator.userAgent) && (
          <div className="install-tip glass">
            <IconInfo />
            <div>
              <b>先添加到主屏幕</b>
              <div className="muted">
                iPhone / iPad：Safari 分享按钮 → 添加到主屏幕。Mac：Safari 菜单「文件 → 添加到程序坞」。不添加的话 Safari 可能在 7 天不访问后清除学习记录。
              </div>
            </div>
          </div>
        )}
        {noBooks ? (
          <Onboarding />
        ) : (
          <motion.div
            className="hero glass"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          >
            <div className="hero-top">
              <ProgressRing value={progress} size={128} stroke={13}>
                <div className="center">
                  {remaining > 0 ? (
                    <>
                      <div className="hero-num">{remaining}</div>
                      <div className="small muted">待完成</div>
                    </>
                  ) : (
                    <IconCheck width={46} height={46} style={{ color: 'var(--green)' }} />
                  )}
                </div>
              </ProgressRing>
              <div className="hero-stats">
                <Stat color="var(--blue)" label="新词" value={counts?.newAvail} />
                <Stat color="var(--orange)" label="学习中" value={counts?.learn} />
                <Stat color="var(--green)" label="复习" value={counts?.review} />
              </div>
            </div>
            {remaining > 0 ? (
              <button
                className="btn btn-primary btn-block"
                onClick={() => {
                  haptic()
                  navigate('/study')
                }}
              >
                {done > 0 ? '继续学习' : '开始学习'}
              </button>
            ) : (
              <div className="stack">
                <div className="center muted" style={{ fontSize: 15 }}>
                  今天的任务完成了。明天按时回来，记忆曲线才有用。
                </div>
                <button className="btn btn-tinted btn-block" onClick={() => navigate('/study?extra=10')}>
                  <IconPlus width={18} height={18} /> 再学 10 个新词
                </button>
              </div>
            )}
          </motion.div>
        )}

        <div className="tiles">
          <Tile icon={<IconFlame />} color="var(--orange)" value={stats?.streak ?? 0} unit="天" label="连续学习" />
          <Tile icon={<IconBolt />} color="var(--purple)" value={done} unit="次" label="今日复习" />
          <Tile icon={<IconBooks />} color="var(--teal)" value={stats?.todayMinutes ?? 0} unit="分钟" label="今日用时" />
        </div>

        {books && books.length > 0 && (
          <Section header="正在学习" footer="新词按这里的顺序从上往下取。在「词书」里可以调整。">
            {books.map(({ book, progress: p }) => (
              <button key={book.id} className="row" onClick={() => navigate(`/books/${encodeURIComponent(book.id)}`)}>
                <div className="row-main">
                  <div className="hstack" style={{ justifyContent: 'space-between' }}>
                    <span className="row-title">{book.name}</span>
                    <span className="row-value small">
                      {p.learned} / {p.total}
                    </span>
                  </div>
                  <div className="progress-bar" style={{ marginTop: 8 }}>
                    <i style={{ width: `${(p.learned / Math.max(1, p.total)) * 100}%` }} />
                  </div>
                </div>
              </button>
            ))}
          </Section>
        )}
      </div>
    </>
  )
}

function Stat({ color, label, value }: { color: string; label: string; value?: number }) {
  return (
    <div className="hero-stat">
      <span className="dot" style={{ background: color }} />
      <span className="muted">{label}</span>
      <span className="hero-stat-num">{value ?? '–'}</span>
    </div>
  )
}

function Tile(props: { icon: React.ReactNode; color: string; value: number; unit: string; label: string }) {
  return (
    <div className="tile">
      <span className="tile-icon" style={{ color: props.color }}>
        {props.icon}
      </span>
      <div className="tile-value">
        {props.value}
        <small>{props.unit}</small>
      </div>
      <div className="tile-label">{props.label}</div>
    </div>
  )
}

function Onboarding() {
  const [busy, setBusy] = useState(false)
  const addCet6 = async () => {
    setBusy(true)
    try {
      const info = (await builtinManifest()).find((b) => b.id === 'cet6')
      if (info) await addBuiltinBook(info)
      haptic('success')
      toast('已添加六级词书')
    } catch (e) {
      toast(e instanceof Error ? e.message : '添加失败')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="hero glass">
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)' }}>从一本词书开始</div>
      <p className="muted" style={{ margin: '6px 0 18px', fontSize: 15, lineHeight: 1.5 }}>
        备考六级，建议先加「六级 CET-6」，再把你自己整理的生词导入成一本词书。每天的新词和复习由记忆算法安排。
      </p>
      <div className="stack">
        <button className="btn btn-primary btn-block" disabled={busy} onClick={addCet6}>
          {busy ? <span className="spinner" /> : <IconPlus width={18} height={18} />} 添加六级词书（5407 词）
        </button>
        <button className="btn btn-tinted btn-block" onClick={() => navigate('/books?import=1')}>
          <IconUpload width={18} height={18} /> 导入我的词库
        </button>
      </div>
    </div>
  )
}
