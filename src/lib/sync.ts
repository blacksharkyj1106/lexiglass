import { useSyncExternalStore } from 'react'
import { ensureBookEntries } from './books'
import { db, SYNC_TABLES, type SyncTable } from './db'
import { getDevice, isLocalKv, updateDevice } from './settings'
import type { Book, Synced } from './types'

/**
 * 与 Cloudflare Worker 的增量同步（见 worker/）。
 * 每条记录带 updatedAt，冲突时以较新的为准（last-write-wins）；
 * 服务端给每次写入分配递增的 seq，客户端用 cursor 只拉取新变化。
 */

interface Change {
  t: SyncTable
  k: string
  v: string
  u: number
}

interface SyncResponse {
  cursor: number
  changes: Change[]
  more: boolean
}

const PUSH_BATCH = 400
const keyOf = (t: SyncTable, rec: Record<string, unknown>) => String(t === 'books' || t === 'logs' ? rec.id : rec.k)

type Status = { state: 'idle' | 'syncing' | 'error' | 'off'; message?: string; at?: number }
let status: Status = { state: 'idle' }
const listeners = new Set<() => void>()
function setStatus(s: Status) {
  status = s
  listeners.forEach((l) => l())
}
export function useSyncStatus(): Status {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => status,
  )
}

async function collectDirty(limit: number): Promise<{ changes: Change[]; total: number }> {
  const changes: Change[] = []
  let total = 0
  for (const t of SYNC_TABLES) {
    const rows = (await db.table(t).where('dirty').equals(1).toArray()) as (Synced & Record<string, unknown>)[]
    const filtered = t === 'kv' ? rows.filter((r) => !isLocalKv(String(r.k))) : rows
    total += filtered.length
    for (const r of filtered) {
      if (changes.length >= limit) break
      const { dirty: _dirty, ...rest } = r
      changes.push({ t, k: keyOf(t, r), v: JSON.stringify(rest), u: r.updatedAt })
    }
  }
  return { changes, total }
}

async function applyRemote(changes: Change[]) {
  const booksToHydrate: Book[] = []
  await db.transaction('rw', SYNC_TABLES.map((t) => db.table(t)), async () => {
    for (const c of changes) {
      if (!SYNC_TABLES.includes(c.t)) continue
      if (c.t === 'kv' && isLocalKv(c.k)) continue
      const table = db.table(c.t)
      const local = (await table.get(c.k)) as Synced | undefined
      if (local && local.updatedAt > c.u) continue
      if (local && local.updatedAt === c.u) {
        if (local.dirty) await table.update(c.k, { dirty: 0 })
        continue
      }
      const v = { ...JSON.parse(c.v), dirty: 0 }
      await table.put(v)
      if (c.t === 'books') booksToHydrate.push(v as Book)
    }
  })
  for (const b of booksToHydrate) await ensureBookEntries(b).catch(() => {})
}

async function markClean(pushed: Change[]) {
  await db.transaction('rw', SYNC_TABLES.map((t) => db.table(t)), async () => {
    for (const c of pushed) {
      const table = db.table(c.t)
      const local = (await table.get(c.k)) as Synced | undefined
      // 推送之后本地又改过的，保持 dirty
      if (local && local.updatedAt === c.u && local.dirty) await table.update(c.k, { dirty: 0 })
    }
  })
}

async function post(url: string, token: string, body: unknown): Promise<SyncResponse> {
  const r = await fetch(`${url.replace(/\/+$/, '')}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (r.status === 401) throw new Error('同步口令不正确')
  if (!r.ok) throw new Error(`同步服务出错 (${r.status})`)
  return r.json()
}

let running: Promise<void> | null = null

export function syncNow(): Promise<void> {
  running ??= doSync().finally(() => (running = null))
  return running
}

async function doSync() {
  const dev = await getDevice()
  if (!dev.syncUrl || !dev.syncToken) {
    setStatus({ state: 'off' })
    return
  }
  if (!navigator.onLine) {
    setStatus({ state: 'error', message: '离线中，联网后自动同步' })
    return
  }
  setStatus({ state: 'syncing' })
  try {
    let cursor = dev.syncCursor
    for (let round = 0; round < 200; round++) {
      const { changes, total } = await collectDirty(PUSH_BATCH)
      const res = await post(dev.syncUrl, dev.syncToken, { cursor, changes })
      await applyRemote(res.changes)
      await markClean(changes)
      cursor = res.cursor
      await updateDevice({ syncCursor: cursor })
      if (!res.more && total <= changes.length) break
    }
    const at = Date.now()
    await updateDevice({ lastSyncAt: at })
    setStatus({ state: 'idle', at })
  } catch (e) {
    setStatus({ state: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}

/** 检查服务是否可达、口令是否正确 */
export async function testSync(url: string, token: string): Promise<void> {
  await post(url, token, { cursor: Number.MAX_SAFE_INTEGER, changes: [] })
}

let timer: ReturnType<typeof setTimeout> | null = null
/** 本地有修改后稍等片刻再同步，合并连续的写入 */
export function scheduleSync(delay = 8000) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void syncNow()
  }, delay)
}

/** 更换同步服务后：从头拉取，并把本地所有记录重新推送一遍 */
export async function resetSyncState() {
  await updateDevice({ syncCursor: 0, lastSyncAt: 0 })
  for (const t of SYNC_TABLES) {
    await db.table(t).toCollection().modify((r: Synced & { k?: string }) => {
      if (t === 'kv' && isLocalKv(String(r.k))) return
      r.dirty = 1
    })
  }
}
