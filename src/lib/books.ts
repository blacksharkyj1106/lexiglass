import { db } from './db'
import { getSettings, updateSettings } from './settings'
import { uid } from './time'
import type { Book, WordEntry } from './types'

export interface BuiltinBookInfo {
  id: string
  name: string
  desc: string
  count: number
}

type RawEntry = Omit<WordEntry, 'k'>

const dataUrl = (path: string) => `${import.meta.env.BASE_URL}data/${path}`

let manifestCache: Promise<BuiltinBookInfo[]> | null = null
export function builtinManifest(): Promise<BuiltinBookInfo[]> {
  manifestCache ??= fetch(dataUrl('books/index.json')).then((r) => {
    if (!r.ok) throw new Error(`加载词书列表失败 (${r.status})`)
    return r.json()
  })
  manifestCache.catch(() => (manifestCache = null))
  return manifestCache
}

const toEntry = (e: RawEntry): WordEntry => ({ ...e, k: e.w.toLowerCase() })

async function fetchBuiltin(id: string): Promise<{ name: string; words: WordEntry[] }> {
  const r = await fetch(dataUrl(`books/${id}.json`))
  if (!r.ok) throw new Error(`下载词书失败 (${r.status})`)
  const data = (await r.json()) as { name: string; words: RawEntry[] }
  return { name: data.name, words: data.words.map(toEntry) }
}

/** 添加内置词书：下载词条写入本地，并设为正在学习 */
export async function addBuiltinBook(info: BuiltinBookInfo) {
  const { words } = await fetchBuiltin(info.id)
  const now = Date.now()
  await db.transaction('rw', db.words, db.books, async () => {
    await db.words.bulkPut(words)
    const existing = await db.books.get(info.id)
    await db.books.put({
      id: info.id,
      name: info.name,
      desc: info.desc,
      builtin: true,
      words: words.map((w) => w.k),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      dirty: 1,
      deleted: 0,
    })
  })
  await setBookActive(info.id, true)
}

/** 同步过来的词书可能只有单词列表，需要补齐本地词条 */
export async function ensureBookEntries(book: Book) {
  if (book.deleted) return
  if (book.entries?.length) {
    await db.words.bulkPut(book.entries)
    return
  }
  if (!book.builtin || !book.words.length) return
  const probe = await db.words.bulkGet([book.words[0], book.words[book.words.length - 1]])
  if (probe.every(Boolean)) return
  const { words } = await fetchBuiltin(book.id)
  await db.words.bulkPut(words)
}

export async function createImportedBook(name: string, entries: WordEntry[]): Promise<string> {
  const id = `u-${uid()}`
  const now = Date.now()
  // 去重并保持原顺序
  const seen = new Set<string>()
  const unique = entries.filter((e) => !seen.has(e.k) && seen.add(e.k))
  await db.transaction('rw', db.words, db.books, async () => {
    // 已有的内置词条不覆盖，导入词条只补充缺失的
    const existing = await db.words.bulkGet(unique.map((e) => e.k))
    await db.words.bulkPut(unique.filter((_, i) => !existing[i]))
    await db.books.put({
      id,
      name,
      builtin: false,
      words: unique.map((e) => e.k),
      entries: unique,
      createdAt: now,
      updatedAt: now,
      dirty: 1,
      deleted: 0,
    })
  })
  await setBookActive(id, true, true)
  return id
}

export async function setBookActive(id: string, active: boolean, first = false) {
  const { activeBooks } = await getSettings()
  const rest = activeBooks.filter((b) => b !== id)
  await updateSettings({ activeBooks: active ? (first ? [id, ...rest] : [...rest, id]) : rest })
}

export async function moveActiveBook(id: string, delta: -1 | 1) {
  const { activeBooks } = await getSettings()
  const i = activeBooks.indexOf(id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= activeBooks.length) return
  const next = activeBooks.slice()
  ;[next[i], next[j]] = [next[j], next[i]]
  await updateSettings({ activeBooks: next })
}

export async function deleteBook(id: string) {
  const book = await db.books.get(id)
  if (!book) return
  await db.books.put({ ...book, words: [], entries: [], deleted: 1, updatedAt: Date.now(), dirty: 1 })
  await setBookActive(id, false)
}

export async function renameBook(id: string, name: string) {
  const book = await db.books.get(id)
  if (!book) return
  await db.books.put({ ...book, name, updatedAt: Date.now(), dirty: 1 })
}

export async function liveBooks(): Promise<Book[]> {
  return (await db.books.toArray()).filter((b) => !b.deleted)
}
