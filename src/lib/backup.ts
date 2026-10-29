import { ensureBookEntries } from './books'
import { db, SYNC_TABLES } from './db'
import { isLocalKv } from './settings'
import type { Book, Synced } from './types'

interface BackupFile {
  app: 'lexiglass'
  version: 1
  exportedAt: number
  tables: Record<string, unknown[]>
}

export async function exportBackup(): Promise<Blob> {
  const tables: Record<string, unknown[]> = {}
  for (const t of SYNC_TABLES) {
    const rows = (await db.table(t).toArray()) as (Synced & { k?: string })[]
    tables[t] = rows.filter((r) => !(t === 'kv' && isLocalKv(String(r.k)))).map(({ dirty: _d, ...rest }) => rest)
  }
  const file: BackupFile = { app: 'lexiglass', version: 1, exportedAt: Date.now(), tables }
  return new Blob([JSON.stringify(file)], { type: 'application/json' })
}

/** 合并导入：同一条记录保留较新的版本 */
export async function importBackup(text: string): Promise<number> {
  const file = JSON.parse(text) as BackupFile
  if (file.app !== 'lexiglass') throw new Error('不是 LexiGlass 的备份文件')
  let n = 0
  const books: Book[] = []
  await db.transaction('rw', SYNC_TABLES.map((t) => db.table(t)), async () => {
    for (const t of SYNC_TABLES) {
      const rows = (file.tables[t] ?? []) as (Synced & Record<string, unknown>)[]
      const table = db.table(t)
      for (const r of rows) {
        const key = t === 'books' || t === 'logs' ? r.id : r.k
        if (t === 'kv' && isLocalKv(String(r.k))) continue
        const local = (await table.get(key as string)) as Synced | undefined
        if (local && local.updatedAt >= r.updatedAt) continue
        await table.put({ ...r, dirty: 1 })
        if (t === 'books') books.push(r as unknown as Book)
        n++
      }
    }
  })
  for (const b of books) await ensureBookEntries(b).catch(() => {})
  return n
}
