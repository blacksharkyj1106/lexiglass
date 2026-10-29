import type { WordEntry } from './types'

type LookupEntry = { w?: string; p?: string; t?: string; d?: string; x?: string; l?: string }
type Shard = Record<string, LookupEntry>

const shards = new Map<string, Promise<Shard>>()
const shardKey = (k: string) => (/^[a-z]$/.test(k[0]) ? k[0] : '_')

function loadShard(name: string): Promise<Shard> {
  let p = shards.get(name)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/lookup/${name}.json`).then((r) => {
      if (!r.ok) throw new Error(`加载词典失败 (${r.status})`)
      return r.json()
    })
    p.catch(() => shards.delete(name))
    shards.set(name, p)
  }
  return p
}

async function lookupRaw(k: string): Promise<LookupEntry | undefined> {
  return (await loadShard(shardKey(k)))[k]
}

const toEntry = (k: string, e: LookupEntry): WordEntry => ({ k, w: e.w ?? k, p: e.p, t: e.t ?? '', d: e.d, x: e.x })

export interface RawItem {
  word: string
  meaning?: string
}

export type ItemStatus = 'ok' | 'lemma' | 'custom' | 'unknown'

export interface ImportItem {
  input: string
  meaning?: string
  status: ItemStatus
  /** 最终要导入的词条 */
  entry?: WordEntry
  /** status=lemma 时：原词自己的词条（若词典里有），用于「保留原形」 */
  original?: WordEntry
  suggestions?: string[]
}

// ---------- 解析 ----------

const NUMBERING = /^\s*(?:\d+\s*[.)、．:：]|[-*•·]\s)\s*/
const POS = /\b(?:n|v|vt|vi|adj|adv|a|prep|conj|pron|int|num|art|aux)\.\s/

function splitLine(line: string): RawItem | null {
  const s = line.replace(NUMBERING, '').trim()
  if (!s) return null
  // 明确的分隔符：制表符、竖线、逗号（中英文）
  const sep = /\t|\s*\|\s*|\s*[,，]\s*/.exec(s)
  if (sep && /^[A-Za-z]/.test(s)) {
    const word = s.slice(0, sep.index).trim()
    const rest = s.slice(sep.index + sep[0].length).trim()
    if (/^[A-Za-z][A-Za-z\-' .]*$/.test(word)) return { word, meaning: rest || undefined }
  }
  // 「单词 + 空格 + 中文/词性释义」
  const m = /^([A-Za-z][A-Za-z\-' .]*?[A-Za-z])\s+(?=[^\x00-\x7F]|[[(（/]|(?:n|v|vt|vi|adj|adv|a|prep|conj|pron)\.)(.+)$/.exec(s)
  if (m) return { word: m[1], meaning: m[2].trim() }
  if (/^[A-Za-z][A-Za-z\-' .]*$/.test(s)) return { word: s.replace(/\.$/, '') }
  return null
}

function parseDelimited(text: string, delim: string): RawItem[] {
  const rows = text.split(/\r?\n/).map((l) => splitCsvRow(l, delim)).filter((r) => r.some(Boolean))
  if (!rows.length) return []
  const head = rows[0].map((h) => h.trim().toLowerCase())
  const wi = head.findIndex((h) => ['word', 'words', '单词', 'english', 'en', 'front'].includes(h))
  const mi = head.findIndex((h) => ['meaning', 'translation', 'definition', '释义', '中文', '意思', 'chinese', 'zh', 'back'].includes(h))
  const hasHeader = wi >= 0
  const w = hasHeader ? wi : 0
  const mIdx = hasHeader ? mi : 1
  return rows
    .slice(hasHeader ? 1 : 0)
    .map((r) => ({ word: (r[w] ?? '').trim(), meaning: mIdx >= 0 ? r[mIdx]?.trim() || undefined : undefined }))
    .filter((r) => /^[A-Za-z]/.test(r.word))
}

function splitCsvRow(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"' && !cur) q = true
    else if (ch === delim) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

function parseJson(text: string): RawItem[] {
  const data = JSON.parse(text)
  const list: unknown[] = Array.isArray(data) ? data : Array.isArray(data?.words) ? data.words : []
  return list
    .map((x): RawItem | null => {
      if (typeof x === 'string') return { word: x }
      if (x && typeof x === 'object') {
        const o = x as Record<string, unknown>
        const word = String(o.word ?? o.w ?? o.headWord ?? '')
        const meaning = o.meaning ?? o.translation ?? o.t ?? o.trans
        return word ? { word, meaning: meaning ? String(meaning) : undefined } : null
      }
      return null
    })
    .filter((x): x is RawItem => !!x)
}

/** 按文件名或内容自动识别格式 */
export function parseInput(text: string, filename = ''): RawItem[] {
  const name = filename.toLowerCase()
  const trimmed = text.trim()
  if (name.endsWith('.json') || /^[[{]/.test(trimmed)) {
    try {
      return parseJson(trimmed)
    } catch {
      /* 不是合法 JSON，按文本处理 */
    }
  }
  if (name.endsWith('.tsv')) return parseDelimited(text, '\t')
  if (name.endsWith('.csv')) return parseDelimited(text, ',')
  return text
    .split(/\r?\n/)
    .flatMap((l) => (POS.test(l) || /[^\x00-\x7F]/.test(l) || l.includes('\t') ? [l] : l.split(/[;；]/)))
    .map(splitLine)
    .filter((x): x is RawItem => !!x)
}

// ---------- 词典匹配 ----------

/** 复数、三单、比较级还原为原形；过去分词 / -ing 作形容词时（如 fatigued）保留 */
function shouldLemmatize(e: LookupEntry): boolean {
  const type = /(?:^|\/)1:([a-z0-9]+)/.exec(e.x ?? '')?.[1] ?? ''
  if (!e.t) return true
  if (/[s3rt]/.test(type)) return true
  if (/[pdi]/.test(type)) return !/^(a\.|adj)/.test(e.t.trim())
  return true
}

function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      best = Math.min(best, cur[j])
    }
    if (best > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

async function suggest(k: string): Promise<string[]> {
  const shard = await loadShard(shardKey(k))
  const max = k.length <= 4 ? 1 : 2
  const scored: [string, number][] = []
  for (const [key, e] of Object.entries(shard)) {
    if (!e.t) continue
    const d = levenshtein(k, key, max)
    if (d <= max) scored.push([key, d * 10 + Math.abs(key.length - k.length)])
  }
  return scored
    .sort((a, b) => a[1] - b[1])
    .slice(0, 4)
    .map(([key]) => key)
}

export async function resolveWord(input: string, meaning?: string): Promise<ImportItem> {
  const k = input.trim().toLowerCase().replace(/\s+/g, ' ')
  const raw = await lookupRaw(k)
  const withMeaning = (e: WordEntry): WordEntry => (meaning ? { ...e, t: meaning } : e)

  if (raw?.l && shouldLemmatize(raw)) {
    const lemmaRaw = await lookupRaw(raw.l.toLowerCase())
    if (lemmaRaw?.t) {
      return {
        input,
        meaning,
        status: 'lemma',
        entry: withMeaning(toEntry(raw.l.toLowerCase(), lemmaRaw)),
        original: raw.t ? withMeaning(toEntry(k, raw)) : undefined,
      }
    }
  }
  if (raw?.t) return { input, meaning, status: 'ok', entry: withMeaning(toEntry(k, raw)) }
  if (meaning) return { input, meaning, status: 'custom', entry: { k, w: input.trim(), t: meaning } }
  return { input, meaning, status: 'unknown', suggestions: await suggest(k) }
}

export async function resolveAll(items: RawItem[], onProgress?: (done: number) => void): Promise<ImportItem[]> {
  const out: ImportItem[] = []
  const seen = new Set<string>()
  for (const it of items) {
    const key = it.word.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(await resolveWord(it.word, it.meaning))
    if (out.length % 50 === 0) onProgress?.(out.length)
  }
  return out
}
