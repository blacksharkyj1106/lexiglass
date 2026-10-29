import { useCallback, useRef, useState } from 'react'
import { Row, Section, Sheet, Switch, toast } from '../components/ui'
import { createImportedBook } from '../lib/books'
import { haptic } from '../lib/haptics'
import { parseInput, resolveAll, resolveWord, type ImportItem } from '../lib/importer'
import { navigate } from '../lib/router'
import type { WordEntry } from '../lib/types'

type Step = 'input' | 'working' | 'review'

const defaultName = () => {
  const d = new Date()
  return `我的词库 ${d.getMonth() + 1}-${d.getDate()}`
}

export default function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>('input')
  const [name, setName] = useState(defaultName)
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [items, setItems] = useState<ImportItem[]>([])
  const [keepOriginal, setKeepOriginal] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setStep('input')
    setText('')
    setFileName('')
    setItems([])
    setKeepOriginal(new Set())
    setName(defaultName())
  }, [])

  const close = useCallback(() => {
    onClose()
    setTimeout(reset, 400)
  }, [onClose, reset])

  const analyze = async () => {
    const raw = parseInput(text, fileName)
    if (!raw.length) {
      toast('没有识别到英文单词')
      return
    }
    setTotal(raw.length)
    setProgress(0)
    setStep('working')
    try {
      const resolved = await resolveAll(raw, setProgress)
      setItems(resolved)
      setStep('review')
    } catch (e) {
      toast(e instanceof Error ? e.message : '识别失败，请检查网络')
      setStep('input')
    }
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setFileName(f.name)
    setText(await f.text())
    if (name.startsWith('我的词库')) setName(f.name.replace(/\.[^.]+$/, ''))
  }

  const replaceWith = async (idx: number, word: string) => {
    const r = await resolveWord(word, items[idx].meaning)
    setItems((list) => list.map((it, i) => (i === idx ? { ...r, input: `${it.input} → ${word}` } : it)))
    haptic()
  }

  const finalEntries = (): WordEntry[] =>
    items.flatMap((it) => {
      if (!it.entry) return []
      if (it.status === 'lemma' && keepOriginal.has(it.input) && it.original) return [it.original]
      return [it.entry]
    })

  const save = async () => {
    const entries = finalEntries()
    if (!entries.length) return
    const id = await createImportedBook(name.trim() || defaultName(), entries)
    haptic('success')
    toast(`已导入 ${new Set(entries.map((e) => e.k)).size} 个词`)
    close()
    navigate(`/books/${encodeURIComponent(id)}`)
  }

  const by = (s: ImportItem['status']) => items.map((it, i) => [it, i] as const).filter(([it]) => it.status === s)
  const lemmas = by('lemma')
  const unknown = by('unknown')
  const count = new Set(finalEntries().map((e) => e.k)).size

  return (
    <Sheet
      open={open}
      onClose={close}
      title="导入词库"
      leading={
        <button className="text-btn" onClick={step === 'review' ? () => setStep('input') : close}>
          {step === 'review' ? '返回' : '取消'}
        </button>
      }
      trailing={
        step === 'input' ? (
          <button className="text-btn bold" disabled={!text.trim()} onClick={analyze} style={{ opacity: text.trim() ? 1 : 0.35 }}>
            识别
          </button>
        ) : step === 'review' ? (
          <button className="text-btn bold" onClick={save} disabled={!count}>
            导入
          </button>
        ) : null
      }
    >
      {step === 'input' && (
        <div className="stack">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="词书名称" aria-label="词书名称" />
          <textarea
            className="field"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setFileName('')
            }}
            placeholder={'每行一个单词，直接从备忘录粘贴：\nperception\nexpose\ntheories\n\n也可以带释义：\nremedy  n. 补救；治疗'}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.csv,.tsv,.json,text/plain,text/csv,application/json"
            hidden
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <button className="btn btn-gray btn-block" onClick={() => fileRef.current?.click()}>
            {fileName ? `已选择：${fileName}` : '选择文件…'}
          </button>
          <p className="small muted" style={{ margin: '4px 4px 0', lineHeight: 1.5 }}>
            音标和释义会自动从词典补全；复数、第三人称等变形会还原为原形（如 theories → theory），拼错的词会给出建议。
          </p>
        </div>
      )}

      {step === 'working' && (
        <div className="empty">
          <div className="spinner" style={{ margin: '0 auto 14px' }} />
          正在查词典… {progress} / {total}
        </div>
      )}

      {step === 'review' && (
        <>
          <Section>
            <Row title="识别到的单词" value={items.length} />
            <Row title="直接匹配" value={by('ok').length} />
            <Row title="还原为原形" value={lemmas.length} />
            <Row title="使用你提供的释义" value={by('custom').length} />
            <Row title={<span style={{ color: unknown.length ? 'var(--red)' : undefined }}>词典里没找到</span>} value={unknown.length} />
          </Section>

          {unknown.length > 0 && (
            <Section header="没找到的词" footer="点建议词替换；不处理的会被跳过。">
              {unknown.map(([it, i]) => (
                <div key={it.input} className="row" style={{ display: 'block' }}>
                  <div className="row-title" style={{ fontWeight: 600 }}>
                    {it.input}
                  </div>
                  <div className="row-sub">{it.suggestions?.length ? '你是不是想输入：' : '没有相近的词，可能拼写有误'}</div>
                  {!!it.suggestions?.length && (
                    <div className="hstack" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {it.suggestions.map((s) => (
                        <button key={s} className="btn btn-tinted btn-sm" onClick={() => replaceWith(i, s)}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </Section>
          )}

          {lemmas.length > 0 && (
            <Section header="还原为原形" footer="打开开关则保留你写的形式。">
              {lemmas.map(([it]) => (
                <Row key={it.input} title={`${it.input} → ${it.entry!.w}`} sub={it.original ? '' : '原形式在词典中没有单独词条'}>
                  {it.original && (
                    <Switch
                      label={`保留 ${it.input}`}
                      checked={keepOriginal.has(it.input)}
                      onChange={(v) =>
                        setKeepOriginal((s) => {
                          const n = new Set(s)
                          if (v) n.add(it.input)
                          else n.delete(it.input)
                          return n
                        })
                      }
                    />
                  )}
                </Row>
              ))}
            </Section>
          )}

          <button className="btn btn-primary btn-block" disabled={!count} onClick={save}>
            导入 {count} 个词
          </button>
        </>
      )}
    </Sheet>
  )
}
