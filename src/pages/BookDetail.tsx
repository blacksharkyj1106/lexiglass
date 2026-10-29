import { useLiveQuery } from 'dexie-react-hooks'
import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { IconChevronDown, IconChevronUp, IconSearch } from '../components/Icons'
import { BackButton, NavBar, ProgressRing, Row, Section, Switch, toast } from '../components/ui'
import WordSheet, { stateBadge } from '../components/WordSheet'
import { formatPhonetic, shortMeaning } from '../components/WordView'
import { deleteBook, moveActiveBook, renameBook, setBookActive } from '../lib/books'
import { db } from '../lib/db'
import { goBack } from '../lib/router'
import { useSettings } from '../lib/settings'
import { bookProgress } from '../lib/stats'

const PAGE = 80

export default function BookDetail({ id }: { id: string }) {
  const settings = useSettings()
  const book = useLiveQuery(() => db.books.get(id), [id])
  const progress = useLiveQuery(async () => (book ? bookProgress(book.words) : null), [book])
  const [query, setQuery] = useState('')
  const q = useDeferredValue(query.trim().toLowerCase())
  const [limit, setLimit] = useState(PAGE)
  const [open, setOpen] = useState<string | null>(null)
  const sentinel = useRef<HTMLDivElement>(null)

  const filtered = book ? (q ? book.words.filter((w) => w.includes(q)) : book.words) : []
  const visible = filtered.slice(0, limit)
  const rows = useLiveQuery(async () => {
    const [entries, cards] = await Promise.all([db.words.bulkGet(visible), db.cards.bulkGet(visible)])
    return visible.map((k, i) => ({ k, entry: entries[i], card: cards[i] }))
  }, [visible.join('|')])

  useEffect(() => setLimit(PAGE), [q])
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((es) => es[0].isIntersecting && setLimit((l) => l + PAGE), { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [book])

  if (book === undefined) return null
  if (!book || book.deleted) {
    return (
      <>
        <NavBar title="词书" leading={<BackButton label="词书" onClick={() => goBack('/books')} />} />
        <div className="empty">这本词书不存在或已删除</div>
      </>
    )
  }

  const activeIdx = settings.activeBooks.indexOf(book.id)
  const active = activeIdx >= 0

  return (
    <>
      <NavBar title={book.name} large leading={<BackButton label="词书" onClick={() => goBack('/books')} />} />
      <div className="page">
        <div className="hero glass hero-row">
          <ProgressRing value={progress ? progress.learned / Math.max(1, progress.total) : 0} size={92} stroke={10}>
            <div className="center" style={{ fontWeight: 700, fontSize: 18 }}>
              {progress ? Math.round((progress.learned / Math.max(1, progress.total)) * 100) : 0}%
            </div>
          </ProgressRing>
          <div className="hero-stats">
            <div className="hero-stat">
              <span className="muted">总词数</span>
              <span className="hero-stat-num">{progress?.total ?? '–'}</span>
            </div>
            <div className="hero-stat">
              <span className="muted">已学</span>
              <span className="hero-stat-num">{progress?.learned ?? '–'}</span>
            </div>
            <div className="hero-stat">
              <span className="muted">已掌握</span>
              <span className="hero-stat-num">{progress?.mature ?? '–'}</span>
            </div>
          </div>
        </div>

        <Section footer={book.desc}>
          <Row title="正在学习">
            <Switch label="正在学习" checked={active} onChange={(v) => setBookActive(book.id, v)} />
          </Row>
          {active && settings.activeBooks.length > 1 && (
            <Row title="取词优先级" value={`第 ${activeIdx + 1} / ${settings.activeBooks.length}`}>
              <button className="icon-btn" aria-label="提前" disabled={activeIdx === 0} onClick={() => moveActiveBook(book.id, -1)}>
                <IconChevronUp />
              </button>
              <button
                className="icon-btn"
                aria-label="推后"
                disabled={activeIdx === settings.activeBooks.length - 1}
                onClick={() => moveActiveBook(book.id, 1)}
              >
                <IconChevronDown />
              </button>
            </Row>
          )}
          {!book.builtin && (
            <Row
              title="重命名"
              className="tint"
              onClick={async () => {
                const name = prompt('词书名称', book.name)?.trim()
                if (name) await renameBook(book.id, name)
              }}
            />
          )}
          <Row
            title={book.builtin ? '移除词书' : '删除词书'}
            className="destructive"
            onClick={async () => {
              if (!confirm(`${book.builtin ? '移除' : '删除'}「${book.name}」？已学单词的记忆进度会保留。`)) return
              await deleteBook(book.id)
              toast('已删除')
              goBack('/books')
            }}
          />
        </Section>

        <label className="search">
          <IconSearch />
          <input type="search" placeholder={`在 ${book.words.length} 个词中搜索`} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>

        <div className="group">
          {rows?.map(({ k, entry, card }) => {
            const b = stateBadge(card)
            return (
              <button key={k} className="row" onClick={() => setOpen(k)}>
                <div className="row-main">
                  <div className="row-title">
                    <strong style={{ fontWeight: 600 }}>{entry?.w ?? k}</strong>{' '}
                    <span className="muted small">{formatPhonetic(entry?.p)}</span>
                  </div>
                  <div className="row-sub">{entry ? shortMeaning(entry.t) : '词条加载中…'}</div>
                </div>
                <span className={`badge ${b.cls}`}>{b.text}</span>
              </button>
            )
          })}
          {filtered.length === 0 && <div className="empty">没有匹配的单词</div>}
        </div>
        <div ref={sentinel} style={{ height: 1 }} />
      </div>
      <WordSheet k={open} onClose={() => setOpen(null)} />
    </>
  )
}
