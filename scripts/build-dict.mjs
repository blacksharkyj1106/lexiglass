// 从 ECDICT (https://github.com/skywind3000/ECDICT, MIT) 生成内置词书与导入查词表。
// 用法: node scripts/build-dict.mjs <path/to/ecdict.csv>
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const src = process.argv[2]
if (!src) {
  console.error('usage: node scripts/build-dict.mjs <ecdict.csv>')
  process.exit(1)
}
const OUT = join(import.meta.dirname, '..', 'public', 'data')

function parseLine(line) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else q = false
      } else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

const cleanTranslation = (t) =>
  t.split('\\n')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('[网络]'))
    .slice(0, 5)
    .join('\n')

const cleanDefinition = (d) =>
  d.split('\\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join('\n')

const lines = readFileSync(src, 'utf8').split(/\r?\n/)
const header = parseLine(lines[0])
const col = Object.fromEntries(header.map((h, i) => [h, i]))

/** @type {Map<string, any>} */
const all = new Map()
for (let i = 1; i < lines.length; i++) {
  if (!lines[i]) continue
  const f = parseLine(lines[i])
  const word = f[col.word]
  if (!word) continue
  const key = word.toLowerCase()
  if (all.has(key) && all.get(key).w === key) continue // 优先保留小写词条
  const tr = cleanTranslation(f[col.translation] || '')
  all.set(key, {
    w: word,
    p: f[col.phonetic] || '',
    t: tr,
    d: cleanDefinition(f[col.definition] || ''),
    x: f[col.exchange] || '',
    tags: (f[col.tag] || '').split(' ').filter(Boolean),
    frq: +f[col.frq] || 0,
    bnc: +f[col.bnc] || 0,
    collins: +f[col.collins] || 0,
    oxford: +f[col.oxford] || 0,
  })
}
console.log('entries', all.size)

const rank = (e) => e.frq || e.bnc || 999999
const slim = (e) => {
  const o = { w: e.w, p: e.p, t: e.t }
  if (e.d) o.d = e.d
  if (e.x) o.x = e.x
  return o
}

const BOOKS = [
  { id: 'cet6', name: '六级 CET-6', desc: '大学英语六级考纲词汇（含四级）', pick: (e) => e.tags.includes('cet6') },
  { id: 'cet6-plus', name: '六级新增', desc: '六级考纲中不属于四级的部分', pick: (e) => e.tags.includes('cet6') && !e.tags.includes('cet4') },
  { id: 'cet4', name: '四级 CET-4', desc: '大学英语四级考纲词汇', pick: (e) => e.tags.includes('cet4') },
  { id: 'ky', name: '考研', desc: '研究生入学考试英语词汇', pick: (e) => e.tags.includes('ky') },
  { id: 'ielts', name: '雅思 IELTS', desc: '雅思核心词汇', pick: (e) => e.tags.includes('ielts') },
  { id: 'toefl', name: '托福 TOEFL', desc: '托福核心词汇', pick: (e) => e.tags.includes('toefl') },
  { id: 'gre', name: 'GRE', desc: 'GRE 词汇', pick: (e) => e.tags.includes('gre') },
  { id: 'gk', name: '高考', desc: '高考英语词汇', pick: (e) => e.tags.includes('gk') },
]

rmSync(OUT, { recursive: true, force: true })
mkdirSync(join(OUT, 'books'), { recursive: true })
mkdirSync(join(OUT, 'lookup'), { recursive: true })

const manifest = []
for (const b of BOOKS) {
  const words = [...all.values()].filter((e) => e.t && b.pick(e)).sort((a, c) => rank(a) - rank(c))
  writeFileSync(join(OUT, 'books', `${b.id}.json`), JSON.stringify({ id: b.id, name: b.name, words: words.map(slim) }))
  manifest.push({ id: b.id, name: b.name, desc: b.desc, count: words.length })
  console.log(b.id, words.length)
}
writeFileSync(join(OUT, 'books', 'index.json'), JSON.stringify(manifest, null, 2))

// 导入查词表：常用词条完整收录；变形词（复数、过去式等）只记录原形
const shards = {}
const shardOf = (w) => (/^[a-z]$/.test(w[0]) ? w[0] : '_')
let full = 0
let forms = 0
for (const [key, e] of all) {
  const lemma = /(?:^|\/)0:([^/]+)/.exec(e.x)?.[1]
  const common = e.t && (e.frq || e.bnc || e.tags.length || e.collins || e.oxford)
  const s = (shards[shardOf(key)] ??= {})
  if (common) {
    s[key] = slim(e)
    if (lemma && lemma.toLowerCase() !== key && all.has(lemma.toLowerCase())) s[key].l = lemma
    full++
  } else if (lemma && lemma.toLowerCase() !== key && all.get(lemma.toLowerCase())?.t) {
    s[key] = { l: lemma }
    forms++
  }
}
for (const [k, v] of Object.entries(shards)) writeFileSync(join(OUT, 'lookup', `${k}.json`), JSON.stringify(v))
console.log('lookup full', full, 'forms', forms)
