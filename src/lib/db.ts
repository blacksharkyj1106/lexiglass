import Dexie, { type EntityTable } from 'dexie'
import type { Book, CardRecord, KvRecord, ReviewLogRecord, WordEntry } from './types'

export const db = new Dexie('lexiglass') as Dexie & {
  words: EntityTable<WordEntry, 'k'>
  books: EntityTable<Book, 'id'>
  cards: EntityTable<CardRecord, 'k'>
  logs: EntityTable<ReviewLogRecord, 'id'>
  kv: EntityTable<KvRecord, 'k'>
}

db.version(1).stores({
  words: 'k',
  books: 'id, dirty',
  cards: 'k, due, state, dirty',
  logs: 'id, k, at, day, dirty',
  kv: 'k, dirty',
})

/** 参与同步的表 */
export const SYNC_TABLES = ['books', 'cards', 'logs', 'kv'] as const
export type SyncTable = (typeof SYNC_TABLES)[number]

/** 请求浏览器把本站数据标记为持久，避免被系统清理 */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch {
    /* 不支持就算了 */
  }
}
