import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { NavBar, Section } from '../components/ui'
import { computeStats } from '../lib/stats'
import { addDays, dayKey } from '../lib/time'

const WEEKS = 18
const FORECAST = 30

const STATE_SERIES = [
  { key: 'new', label: '已加入未学', color: 'var(--blue)' },
  { key: 'learning', label: '学习中', color: 'var(--orange)' },
  { key: 'young', label: '记忆中（间隔 < 21 天）', color: 'var(--teal)' },
  { key: 'mature', label: '已掌握（间隔 ≥ 21 天）', color: 'var(--green)' },
  { key: 'suspended', label: '已斩', color: 'var(--purple)' },
] as const

const fmtDay = (key: string) => {
  const [, m, d] = key.split('-').map(Number)
  return `${m}月${d}日`
}

export default function Stats() {
  const stats = useLiveQuery(() => computeStats(FORECAST), [])

  return (
    <>
      <NavBar title="统计" large />
      <div className="page">
        <div className="tiles">
          <Hero value={stats?.totalReviews ?? 0} unit="次" label="累计复习" />
          <Hero value={stats?.streak ?? 0} unit="天" label="连续学习" />
          <Hero
            value={stats?.retention == null ? '–' : Math.round(stats.retention * 100)}
            unit={stats?.retention == null ? '' : '%'}
            label="30 天记忆保持率"
          />
        </div>
        {stats && (
          <>
            <Section header="学习日历" footer="每格一天，颜色越深复习次数越多。">
              <Heatmap daily={stats.daily} />
            </Section>
            <Section header="未来 30 天复习量" footer="FSRS 把复习安排在你快要忘记的时候，所以越往后越稀疏。">
              <Forecast data={stats.forecast} />
            </Section>
            <Section header="单词状态">
              <StateBreakdown counts={stats.counts} />
            </Section>
          </>
        )}
        <Section header="关于记忆算法">
          <div style={{ padding: '14px 16px', fontSize: 15, lineHeight: 1.6 }} className="muted">
            调度使用 FSRS-7。每个词记录<b>难度</b>和<b>稳定性</b>，据此估计你此刻还记得它的概率；概率掉到「目标记忆保持率」（设置里调）时安排复习。
            每次复习后间隔会按你的评分重新计算：答「重来」间隔清零，答「简单」间隔拉得更长。所以<b>评分要老实</b>：看了答案才想起来的，就是「重来」。
          </div>
        </Section>
      </div>
    </>
  )
}

function Hero({ value, unit, label }: { value: number | string; unit: string; label: string }) {
  return (
    <div className="tile">
      <div className="tile-value" style={{ marginTop: 0 }}>
        {value}
        <small>{unit}</small>
      </div>
      <div className="tile-label">{label}</div>
    </div>
  )
}

function Heatmap({ daily }: { daily: Map<string, number> }) {
  const [sel, setSel] = useState<string | null>(null)
  const { cols, max } = useMemo(() => {
    const today = dayKey()
    // 让最后一列以本周日结束（周一为每列第一行）
    const [y, m, d] = today.split('-').map(Number)
    const dow = (new Date(y, m - 1, d).getDay() + 6) % 7
    const end = addDays(today, 6 - dow)
    const start = addDays(end, -WEEKS * 7 + 1)
    const cols: { key: string; n: number; future: boolean }[][] = []
    let max = 0
    for (let w = 0; w < WEEKS; w++) {
      const col = []
      for (let i = 0; i < 7; i++) {
        const key = addDays(start, w * 7 + i)
        const n = daily.get(key) ?? 0
        max = Math.max(max, n)
        col.push({ key, n, future: key > today })
      }
      cols.push(col)
    }
    return { cols, max }
  }, [daily])

  // 单色由浅到深的四级
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / Math.max(1, max)) * 4)))
  const selN = sel ? daily.get(sel) ?? 0 : null

  return (
    <div style={{ padding: '14px 16px 12px' }}>
      <div className="heatmap" role="img" aria-label="过去 18 周每天的复习次数">
        {cols.map((col, i) => (
          <div key={i} className="heatmap-col">
            {col.map((c) => (
              <button
                key={c.key}
                className={`hm-cell l${level(c.n)}${c.future ? ' future' : ''}${sel === c.key ? ' sel' : ''}`}
                title={`${fmtDay(c.key)}：${c.n} 次`}
                aria-label={`${fmtDay(c.key)}：${c.n} 次`}
                disabled={c.future}
                onClick={() => setSel(sel === c.key ? null : c.key)}
                onMouseEnter={() => setSel(c.key)}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="hstack small muted" style={{ marginTop: 10, justifyContent: 'space-between' }}>
        <span>{sel ? `${fmtDay(sel)} · 复习 ${selN} 次` : '点按某一天查看'}</span>
        <span className="hstack" style={{ gap: 3 }}>
          少
          {[0, 1, 2, 3, 4].map((l) => (
            <i key={l} className={`hm-cell l${l}`} style={{ display: 'inline-block' }} />
          ))}
          多
        </span>
      </div>
    </div>
  )
}

function Forecast({ data }: { data: number[] }) {
  const [sel, setSel] = useState<number | null>(null)
  const max = Math.max(1, ...data)
  const tick = niceMax(max)
  const peak = data.indexOf(Math.max(...data))
  const H = 140
  const label = (i: number) => (i === 0 ? '今天' : i === 1 ? '明天' : `${i} 天后`)
  const shown = sel ?? null

  return (
    <div style={{ padding: '14px 16px 12px' }}>
      <div className="small muted" style={{ height: 18, marginBottom: 6 }}>
        {shown != null ? `${label(shown)} · ${data[shown]} 个词` : `今天到期 ${data[0]} 个 · 峰值 ${label(peak)} ${data[peak]} 个`}
      </div>
      <div className="fc">
        <div className="fc-axis">
          <span>{tick}</span>
          <span>{tick / 2}</span>
          <span>0</span>
        </div>
        <div className="fc-plot" style={{ height: H }} onMouseLeave={() => setSel(null)}>
          <i className="fc-grid" style={{ bottom: '50%' }} />
          <i className="fc-grid" style={{ bottom: '100%' }} />
          {data.map((n, i) => (
            <button
              key={i}
              className={`fc-slot${shown === i ? ' sel' : ''}`}
              aria-label={`${label(i)}：${n} 个词`}
              onClick={() => setSel(sel === i ? null : i)}
              onMouseEnter={() => setSel(i)}
            >
              <i className="fc-bar" style={{ height: `${(n / tick) * 100}%`, opacity: shown == null || shown === i ? 1 : 0.45 }} />
            </button>
          ))}
        </div>
      </div>
      <div className="fc-x small muted">
        <span>今天</span>
        <span>15 天</span>
        <span>30 天</span>
      </div>
    </div>
  )
}

function niceMax(n: number) {
  const steps = [2, 4, 10, 20, 40, 50, 100, 200, 400, 500, 1000, 2000, 5000]
  return steps.find((s) => s >= n) ?? Math.ceil(n / 1000) * 1000
}

function StateBreakdown({ counts }: { counts: Record<(typeof STATE_SERIES)[number]['key'], number> }) {
  const total = STATE_SERIES.reduce((s, x) => s + counts[x.key], 0)
  return (
    <>
      <div style={{ padding: '16px 16px 6px' }}>
        <div className="stacked" role="img" aria-label="单词状态分布">
          {total === 0 && <i style={{ flex: 1, background: 'var(--fill-3)' }} />}
          {STATE_SERIES.filter((s) => counts[s.key] > 0).map((s) => (
            <i key={s.key} style={{ flex: counts[s.key], background: s.color }} title={`${s.label}：${counts[s.key]}`} />
          ))}
        </div>
      </div>
      {STATE_SERIES.map((s) => (
        <div key={s.key} className="row">
          <span className="legend-dot" style={{ background: s.color }} />
          <div className="row-main">{s.label}</div>
          <span className="row-value">{counts[s.key]}</span>
        </div>
      ))}
    </>
  )
}
