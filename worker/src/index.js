// LexiGlass 同步服务：单用户、口令鉴权、记录级 last-write-wins 增量同步。
//
// POST /sync  { cursor, changes: [{ t, k, v, u }] }
//   -> { cursor, changes: [{ t, k, v, u }], more }
// 写入时只有 u（updatedAt）更新的版本才会覆盖；每次写入分配递增的 seq，
// 客户端带上次的 cursor 拉取 seq 更大的记录。

const TABLES = new Set(['books', 'cards', 'logs', 'kv'])
const PULL_LIMIT = 1000
// D1 单条 SQL 绑定参数有大小限制，按体积分批写入
const CHUNK_BYTES = 400_000

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

function json(data, status, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(env) },
  })
}

/** 常量时间比较，避免通过响应时间猜口令 */
function safeEqual(a, b) {
  const enc = new TextEncoder()
  const x = enc.encode(a)
  const y = enc.encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

function validChange(c) {
  return (
    c &&
    TABLES.has(c.t) &&
    typeof c.k === 'string' &&
    c.k.length > 0 &&
    c.k.length <= 512 &&
    typeof c.v === 'string' &&
    c.v.length <= 1_000_000 &&
    Number.isFinite(c.u)
  )
}

function chunk(changes) {
  const out = []
  let cur = []
  let size = 0
  for (const c of changes) {
    const n = c.v.length + c.k.length + 64
    if (cur.length && size + n > CHUNK_BYTES) {
      out.push(cur)
      cur = []
      size = 0
    }
    cur.push(c)
    size += n
  }
  if (cur.length) out.push(cur)
  return out
}

// 整批写入只用一条 SQL：json_each 展开，ON CONFLICT 时仅接受更新的版本。
// seq 取当前最大值加上行号，同一事务内保证唯一递增。
const UPSERT = `
INSERT INTO records (tbl, k, v, u, seq)
SELECT json_extract(j.value, '$.t'), json_extract(j.value, '$.k'), json_extract(j.value, '$.v'),
       json_extract(j.value, '$.u'), (SELECT COALESCE(MAX(seq), 0) FROM records) + j.key + 1
FROM json_each(?1) AS j
WHERE true
ON CONFLICT (tbl, k) DO UPDATE SET v = excluded.v, u = excluded.u, seq = excluded.seq
WHERE excluded.u > records.u`

export async function handleSync(body, env) {
  const cursor = Number.isFinite(body?.cursor) ? Math.max(0, body.cursor) : 0
  const changes = Array.isArray(body?.changes) ? body.changes.filter(validChange) : []

  for (const part of chunk(changes)) {
    await env.DB.prepare(UPSERT)
      .bind(JSON.stringify(part.map(({ t, k, v, u }) => ({ t, k, v, u }))))
      .run()
  }

  const { results } = await env.DB.prepare('SELECT tbl AS t, k, v, u, seq FROM records WHERE seq > ?1 ORDER BY seq LIMIT ?2')
    .bind(cursor, PULL_LIMIT + 1)
    .all()
  let more = results.length > PULL_LIMIT
  const rows = more ? results.slice(0, PULL_LIMIT) : results
  let next = rows.length ? rows[rows.length - 1].seq : cursor
  if (!rows.length && cursor > 0) {
    // 客户端 cursor 比服务端还新（例如数据库被重建），让客户端从头拉取
    const top = await env.DB.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM records').first()
    if (cursor > top.m) {
      next = 0
      more = top.m > 0
    }
  }
  return { cursor: next, more, changes: rows.map(({ t, k, v, u }) => ({ t, k, v, u })) }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) })
    if (request.method === 'GET' && url.pathname === '/') return json({ ok: true, service: 'lexiglass-sync' }, 200, env)
    if (url.pathname !== '/sync' || request.method !== 'POST') return json({ error: 'not found' }, 404, env)

    if (!env.SYNC_TOKEN) return json({ error: 'SYNC_TOKEN 未配置' }, 500, env)
    const auth = request.headers.get('Authorization') ?? ''
    if (!safeEqual(auth, `Bearer ${env.SYNC_TOKEN}`)) return json({ error: 'unauthorized' }, 401, env)

    let body
    try {
      body = await request.json()
    } catch {
      return json({ error: 'bad json' }, 400, env)
    }
    try {
      return json(await handleSync(body, env), 200, env)
    } catch (e) {
      return json({ error: String(e?.message ?? e) }, 500, env)
    }
  },
}
