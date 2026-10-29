import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { IconCheck, IconPlus } from '../components/Icons'
import { NavBar, Row, Section, toast } from '../components/ui'
import ImportSheet from './ImportSheet'
import { addBuiltinBook, builtinManifest, liveBooks, type BuiltinBookInfo } from '../lib/books'
import { haptic } from '../lib/haptics'
import { navigate, useRoute } from '../lib/router'
import { useSettings } from '../lib/settings'
import { bookProgress } from '../lib/stats'
import type { Book } from '../lib/types'

export default function Books() {
  const route = useRoute()
  const settings = useSettings()
  const [importOpen, setImportOpen] = useState(route.includes('import=1'))
  const [manifest, setManifest] = useState<BuiltinBookInfo[] | null>(null)
  const [adding, setAdding] = useState<string | null>(null)

  useEffect(() => {
    if (route.includes('import=1')) {
      setImportOpen(true)
      navigate('/books', true)
    }
  }, [route])

  useEffect(() => {
    builtinManifest()
      .then(setManifest)
      .catch(() => setManifest([]))
  }, [])

  const books = useLiveQuery(async () => {
    const list = await liveBooks()
    return Promise.all(list.map(async (b) => ({ book: b, progress: await bookProgress(b.words) })))
  }, [])

  const active = settings.activeBooks
    .map((id) => books?.find((b) => b.book.id === id))
    .filter((x): x is { book: Book; progress: Awaited<ReturnType<typeof bookProgress>> } => !!x)
  const inactive = (books ?? []).filter((b) => !settings.activeBooks.includes(b.book.id))
  const owned = new Set((books ?? []).map((b) => b.book.id))

  const add = async (info: BuiltinBookInfo) => {
    setAdding(info.id)
    try {
      await addBuiltinBook(info)
      haptic('success')
      toast(`已添加「${info.name}」`)
    } catch (e) {
      toast(e instanceof Error ? e.message : '添加失败')
    } finally {
      setAdding(null)
    }
  }

  const renderBook = ({ book, progress }: (typeof active)[number]) => (
    <Row
      key={book.id}
      title={book.name}
      sub={`${progress.total} 词 · 已学 ${progress.learned}${book.builtin ? '' : ' · 我的导入'}`}
      chevron
      onClick={() => navigate(`/books/${encodeURIComponent(book.id)}`)}
    />
  )

  return (
    <>
      <NavBar
        title="词书"
        large
        trailing={
          <button className="icon-btn glass" aria-label="导入词库" onClick={() => setImportOpen(true)}>
            <IconPlus />
          </button>
        }
      />
      <div className="page">
        {active.length > 0 && (
          <Section header="正在学习" footer="新词按从上到下的顺序取用。">
            {active.map(renderBook)}
          </Section>
        )}
        {inactive.length > 0 && <Section header="未在学习">{inactive.map(renderBook)}</Section>}

        <Section header="我的词库">
          <Row
            title="导入单词表"
            sub="粘贴文本，或选择 txt / csv / json 文件"
            icon={<IconPlus />}
            iconBg="var(--indigo)"
            className="tint"
            onClick={() => setImportOpen(true)}
          />
        </Section>

        <Section header="内置词书" footer="词条来自开源词典 ECDICT（MIT 协议），按词频从高到低排列。">
          {manifest === null && (
            <Row title={<span className="spinner" />} />
          )}
          {manifest?.map((info) => (
            <Row key={info.id} title={info.name} sub={`${info.count} 词 · ${info.desc}`}>
              {owned.has(info.id) ? (
                <span className="badge green">
                  <IconCheck width={12} height={12} style={{ marginRight: 3 }} />
                  已添加
                </span>
              ) : (
                <button className="btn btn-tinted btn-sm" disabled={adding !== null} onClick={() => add(info)}>
                  {adding === info.id ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '添加'}
                </button>
              )}
            </Row>
          ))}
        </Section>
      </div>
      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  )
}
