import type { WordEntry } from '../lib/types'

const EXCHANGE: Record<string, string> = {
  s: '复数',
  p: '过去式',
  d: '过去分词',
  i: '现在分词',
  '3': '三单',
  r: '比较级',
  t: '最高级',
}

export function parseExchange(x?: string): { label: string; form: string }[] {
  if (!x) return []
  return x
    .split('/')
    .map((p) => p.split(':'))
    .filter(([k, v]) => EXCHANGE[k] && v)
    .map(([k, v]) => ({ label: EXCHANGE[k], form: v }))
}

export function splitTranslation(t: string): { pos?: string; text: string }[] {
  return t
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = /^((?:[a-z]+\.\s*)+|\[[^\]]+\])\s*(.*)$/.exec(line)
      return m ? { pos: m[1].trim(), text: m[2] } : { text: line }
    })
}

/** 第一行释义，用于列表副标题 */
export const shortMeaning = (t: string) => t.split('\n')[0]?.replace(/\s+/g, ' ') ?? ''

export const formatPhonetic = (p?: string) => (p ? `/${p.replace(/^\/|\/$/g, '')}/` : '')

export function Meaning({ entry, showEnglish }: { entry: WordEntry; showEnglish?: boolean }) {
  const lines = splitTranslation(entry.t)
  const forms = parseExchange(entry.x)
  return (
    <div className="meaning">
      <ul className="meaning-lines">
        {lines.map((l, i) => (
          <li key={i}>
            {l.pos && <span className="pos">{l.pos}</span>}
            <span>{l.text}</span>
          </li>
        ))}
      </ul>
      {forms.length > 0 && (
        <div className="forms">
          {forms.map((f) => (
            <span key={f.label}>
              <span className="muted">{f.label}</span> {f.form}
            </span>
          ))}
        </div>
      )}
      {showEnglish && entry.d && (
        <div className="english">
          {entry.d.split('\n').map((d, i) => (
            <p key={i}>{d}</p>
          ))}
        </div>
      )}
    </div>
  )
}
