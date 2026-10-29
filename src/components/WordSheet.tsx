import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import type { CardRecord } from '../lib/types'
import { haptic } from '../lib/haptics'
import { isLiveCard, resetCard, setSuspended, State } from '../lib/srs'
import { useSettings } from '../lib/settings'
import { formatInterval, formatRelativeDue } from '../lib/time'
import { speak } from '../lib/tts'
import { IconRotate, IconScissors, IconSpeaker } from './Icons'
import { Row, Section, Sheet, toast } from './ui'
import { formatPhonetic, Meaning } from './WordView'

export function stateBadge(card: CardRecord | undefined): { text: string; cls: string } {
  if (!isLiveCard(card)) return { text: '未学', cls: '' }
  if (card.suspended) return { text: '已斩', cls: 'purple' }
  if (card.state === State.New) return { text: '未学', cls: '' }
  if (card.state === State.Learning || card.state === State.Relearning) return { text: '学习中', cls: 'orange' }
  if (card.fsrs.scheduledDays >= 21) return { text: '已掌握', cls: 'green' }
  return { text: `${card.fsrs.scheduledDays} 天`, cls: 'blue' }
}

export default function WordSheet({ k, onClose }: { k: string | null; onClose: () => void }) {
  const settings = useSettings()
  const data = useLiveQuery(async () => (k ? { entry: await db.words.get(k), card: await db.cards.get(k) } : null), [k])
  const entry = data?.entry
  const card = data?.card
  const live = isLiveCard(card)
  const badge = stateBadge(card)

  return (
    <Sheet open={!!k} onClose={onClose} title="单词" trailing={<button className="text-btn bold" onClick={onClose}>完成</button>}>
      {entry && (
        <>
          <div className="word-head">
            <div>
              <div className="word-big">{entry.w}</div>
              {entry.p && <div className="phonetic">{formatPhonetic(entry.p)}</div>}
            </div>
            <button className="icon-btn glass" aria-label="朗读" onClick={() => speak(entry.w)}>
              <IconSpeaker />
            </button>
          </div>
          <div className="group" style={{ padding: '14px 16px', marginBottom: 24 }}>
            <Meaning entry={entry} showEnglish={settings.showEnglish} />
          </div>
          <Section header="记忆状态">
            <Row title="状态" value={<span className={`badge ${badge.cls}`}>{badge.text}</span>} />
            {live && card.state !== State.New && (
              <>
                <Row title="下次复习" value={formatRelativeDue(card.due)} />
                <Row title="记忆稳定性" value={formatInterval(card.fsrs.stability * 86_400_000)} />
                <Row title="难度" value={`${card.fsrs.difficulty.toFixed(1)} / 10`} />
                <Row title="复习 / 遗忘次数" value={`${card.fsrs.reps} / ${card.fsrs.lapses}`} />
              </>
            )}
          </Section>
          <Section>
            <Row
              title={live && card.suspended ? '恢复学习' : '斩：我已经认识'}
              icon={<IconScissors />}
              iconBg="var(--purple)"
              className="tint"
              onClick={async () => {
                await setSuspended(entry.k, !(live && card.suspended))
                haptic('success')
                toast(live && card.suspended ? '已恢复' : '已斩，不会再出现')
              }}
            />
            {live && (
              <Row
                title="重置学习进度"
                icon={<IconRotate />}
                iconBg="var(--red)"
                className="destructive"
                onClick={async () => {
                  if (!confirm(`重置「${entry.w}」的学习记录？`)) return
                  await resetCard(entry.k)
                  toast('已重置')
                }}
              />
            )}
          </Section>
        </>
      )}
    </Sheet>
  )
}
