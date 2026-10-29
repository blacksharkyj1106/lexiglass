// 用 node:sqlite 模拟 D1，验证同步服务的合并与增量拉取逻辑
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import worker, { handleSync } from '../worker/src/index.js'

function fakeD1() {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../worker/schema.sql', import.meta.url), 'utf8'))
  const stmt = (sql, params = []) => ({
    bind: (...p) => stmt(sql, p),
    run: async () => db.prepare(sql).run(...params),
    all: async () => ({ results: db.prepare(sql).all(...params) }),
    first: async () => db.prepare(sql).get(...params),
  })
  return { prepare: (sql) => stmt(sql) }
}

const env = () => ({ DB: fakeD1(), SYNC_TOKEN: 'secret' })
const ch = (t, k, u, extra = {}) => ({ t, k, u, v: JSON.stringify({ k, updatedAt: u, ...extra }) })

test('两台设备互相拿到对方的修改', async () => {
  const e = env()
  const a = await handleSync({ cursor: 0, changes: [ch('cards', 'apple', 100), ch('logs', 'l1', 100)] }, e)
  assert.equal(a.changes.length, 2)
  const b = await handleSync({ cursor: 0, changes: [ch('cards', 'banana', 200)] }, e)
  assert.deepEqual(b.changes.map((c) => c.k).sort(), ['apple', 'banana', 'l1'])
  const a2 = await handleSync({ cursor: a.cursor, changes: [] }, e)
  assert.deepEqual(a2.changes.map((c) => c.k), ['banana'])
})

test('旧版本不会覆盖新版本', async () => {
  const e = env()
  await handleSync({ cursor: 0, changes: [ch('cards', 'apple', 300, { state: 2 })] }, e)
  const r = await handleSync({ cursor: 0, changes: [ch('cards', 'apple', 100, { state: 0 })] }, e)
  assert.equal(r.changes.length, 1)
  assert.equal(JSON.parse(r.changes[0].v).state, 2)
  const r2 = await handleSync({ cursor: 0, changes: [ch('cards', 'apple', 400, { state: 3 })] }, e)
  assert.equal(JSON.parse(r2.changes[0].v).state, 3)
})

test('seq 唯一递增，分页拉取不丢记录', async () => {
  const e = env()
  const many = Array.from({ length: 2500 }, (_, i) => ch('logs', `l${i}`, i + 1))
  await handleSync({ cursor: 0, changes: many }, e)
  await handleSync({ cursor: 0, changes: [ch('logs', 'l5', 99999)] }, e)
  const seen = new Set()
  let cursor = 0
  for (let i = 0; i < 10; i++) {
    const r = await handleSync({ cursor, changes: [] }, e)
    r.changes.forEach((c) => seen.add(c.k))
    cursor = r.cursor
    if (!r.more) break
  }
  assert.equal(seen.size, 2500)
})

test('服务端数据库重建后，客户端从头拉取', async () => {
  const e = env()
  await handleSync({ cursor: 0, changes: [ch('cards', 'x', 1)] }, e)
  const r = await handleSync({ cursor: 500, changes: [] }, e)
  assert.equal(r.cursor, 0)
  assert.equal(r.more, true)
})

test('口令错误返回 401，非法记录被忽略', async () => {
  const e = env()
  const bad = await worker.fetch(new Request('https://x/sync', { method: 'POST', headers: { Authorization: 'Bearer nope' }, body: '{}' }), e)
  assert.equal(bad.status, 401)
  const ok = await worker.fetch(
    new Request('https://x/sync', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret' },
      body: JSON.stringify({ cursor: 0, changes: [{ t: 'evil', k: 'a', v: '{}', u: 1 }, ch('kv', 'settings', 5)] }),
    }),
    e,
  )
  assert.equal(ok.status, 200)
  const data = await ok.json()
  assert.deepEqual(data.changes.map((c) => c.t), ['kv'])
})
