import { useEffect, useRef, useState } from 'react'
import {
  IconBrain,
  IconCloud,
  IconDownload,
  IconInfo,
  IconPaint,
  IconSpeaker,
  IconSync,
  IconTrash,
  IconUpload,
  IconWave,
} from '../components/Icons'
import { NavBar, Row, Section, Segmented, Stepper, Switch, toast } from '../components/ui'
import { exportBackup, importBackup } from '../lib/backup'
import { db } from '../lib/db'
import { haptic } from '../lib/haptics'
import { updateDevice, updateSettings, useDevice, useSettings } from '../lib/settings'
import { resetSyncState, syncNow, testSync, useSyncStatus } from '../lib/sync'
import { englishVoices, speak } from '../lib/tts'
import type { Settings as S } from '../lib/types'

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

export default function Settings() {
  const s = useSettings()
  const set = (patch: Partial<S>) => void updateSettings(patch)

  return (
    <>
      <NavBar title="设置" large />
      <div className="page">
        <Section header="学习" footer="复习上限防止断更几天后被积压淹没；超出的部分顺延到之后几天。">
          <Row title="每日新词" icon={<IconBrain />} iconBg="var(--blue)">
            <span className="row-value" style={{ minWidth: 28, textAlign: 'right' }}>
              {s.dailyNew}
            </span>
            <Stepper value={s.dailyNew} min={0} max={200} step={5} onChange={(v) => set({ dailyNew: v })} />
          </Row>
          <Row title="每日复习上限" icon={<IconSync />} iconBg="var(--green)">
            <span className="row-value" style={{ minWidth: 28, textAlign: 'right' }}>
              {s.maxReviews}
            </span>
            <Stepper value={s.maxReviews} min={20} max={1000} step={20} onChange={(v) => set({ maxReviews: v })} />
          </Row>
          <Row title="新词顺序">
            <Segmented
              value={s.newOrder}
              options={[
                { value: 'book', label: '词频' },
                { value: 'random', label: '随机' },
              ]}
              onChange={(v) => set({ newOrder: v })}
            />
          </Row>
          <Row title="学习方向">
            <Segmented
              value={s.direction}
              options={[
                { value: 'en-zh', label: '看词想义' },
                { value: 'zh-en', label: '看义想词' },
              ]}
              onChange={(v) => set({ direction: v })}
            />
          </Row>
          <Row title="显示英文释义">
            <Switch label="显示英文释义" checked={s.showEnglish} onChange={(v) => set({ showEnglish: v })} />
          </Row>
        </Section>

        <Section
          header="记忆曲线"
          footer={`复习安排在你还有 ${Math.round(s.retention * 100)}% 把握记得的时候。调高记得更牢，但每天复习量明显增加；考前冲刺可设 95%，平时 90% 最划算。`}
        >
          <div className="row" style={{ display: 'block' }}>
            <div className="hstack" style={{ justifyContent: 'space-between' }}>
              <span>目标记忆保持率</span>
              <span className="row-value">{Math.round(s.retention * 100)}%</span>
            </div>
            <input
              type="range"
              min={80}
              max={97}
              step={1}
              value={Math.round(s.retention * 100)}
              style={{ '--pct': `${((s.retention * 100 - 80) / 17) * 100}%` } as React.CSSProperties}
              onChange={(e) => set({ retention: Number(e.target.value) / 100 })}
              aria-label="目标记忆保持率"
            />
          </div>
        </Section>

        <VoiceSection />

        <Section header="外观与反馈">
          <Row title="外观" icon={<IconPaint />} iconBg="var(--indigo)">
            <Segmented
              value={s.theme}
              options={[
                { value: 'system', label: '自动' },
                { value: 'light', label: '浅色' },
                { value: 'dark', label: '深色' },
              ]}
              onChange={(v) => set({ theme: v })}
            />
          </Row>
          <Row title="触感反馈" icon={<IconWave />} iconBg="var(--pink)">
            <Switch label="触感反馈" checked={s.haptics} onChange={(v) => set({ haptics: v })} />
          </Row>
        </Section>

        <SyncSection />
        <DataSection />

        <Section header="关于" footer="LexiGlass · 词典数据来自 ECDICT（MIT）· 记忆算法 FSRS（ts-fsrs）">
          {!isStandalone() && (
            <Row
              title="添加到主屏幕"
              sub="Safari 分享按钮 → 添加到主屏幕。不添加的话，7 天不打开数据可能被清除。"
              icon={<IconInfo />}
              iconBg="var(--orange)"
              className="wrap"
            />
          )}
          <Row title="版本" value="0.1.0" />
        </Section>
      </div>
    </>
  )
}

function VoiceSection() {
  const s = useSettings()
  const dev = useDevice()
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const set = (patch: Partial<S>) => void updateSettings(patch)

  useEffect(() => {
    const load = () => setVoices(englishVoices())
    load()
    speechSynthesis?.addEventListener?.('voiceschanged', load)
    return () => speechSynthesis?.removeEventListener?.('voiceschanged', load)
  }, [])

  return (
    <Section
      header="发音"
      footer="「自动」联网时用真人录音，离线时用系统语音。想让系统语音更自然：iPhone 设置 → 辅助功能 → 朗读内容 → 声音 → 英语，下载「增强」或「高品质」语音，然后在下面选它。"
    >
      <Row title="自动朗读" icon={<IconSpeaker />} iconBg="var(--orange)">
        <Switch label="自动朗读" checked={s.autoSpeak} onChange={(v) => set({ autoSpeak: v })} />
      </Row>
      <Row title="口音">
        <Segmented
          value={s.accent}
          options={[
            { value: 'us', label: '美音' },
            { value: 'uk', label: '英音' },
          ]}
          onChange={(v) => set({ accent: v })}
        />
      </Row>
      <Row title="发音来源">
        <Segmented
          value={s.voiceSource}
          options={[
            { value: 'auto', label: '自动' },
            { value: 'online', label: '真人' },
            { value: 'system', label: '系统' },
          ]}
          onChange={(v) => set({ voiceSource: v })}
        />
      </Row>
      <div className="row" style={{ display: 'block' }}>
        <div className="hstack" style={{ justifyContent: 'space-between' }}>
          <span>语速</span>
          <span className="row-value">{s.rate.toFixed(2)}×</span>
        </div>
        <input
          type="range"
          min={0.6}
          max={1.2}
          step={0.05}
          value={s.rate}
          style={{ '--pct': `${((s.rate - 0.6) / 0.6) * 100}%` } as React.CSSProperties}
          onChange={(e) => set({ rate: Number(e.target.value) })}
          aria-label="语速"
        />
      </div>
      {voices.length > 0 && (
        <Row title="系统语音">
          <select
            className="select"
            value={dev.voiceName}
            onChange={(e) => void updateDevice({ voiceName: e.target.value })}
            aria-label="系统语音"
          >
            <option value="">自动选择</option>
            {voices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </Row>
      )}
      <Row title="试听" className="tint" onClick={() => speak('pronunciation')} />
    </Section>
  )
}

function SyncSection() {
  const dev = useDevice()
  const status = useSyncStatus()
  const [url, setUrl] = useState(dev.syncUrl)
  const [token, setToken] = useState(dev.syncToken)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    setUrl(dev.syncUrl)
    setToken(dev.syncToken)
  }, [dev.syncUrl, dev.syncToken])

  const changed = url.trim() !== dev.syncUrl || token.trim() !== dev.syncToken
  const configured = !!dev.syncUrl && !!dev.syncToken

  const save = async () => {
    const u = url.trim().replace(/\/+$/, '')
    const t = token.trim()
    if (!u || !t) {
      await updateDevice({ syncUrl: '', syncToken: '' })
      toast('已关闭同步')
      return
    }
    setTesting(true)
    try {
      await testSync(u, t)
      await updateDevice({ syncUrl: u, syncToken: t })
      await resetSyncState()
      await syncNow()
      haptic('success')
      toast('同步已开启')
    } catch (e) {
      toast(e instanceof Error ? e.message : '连接失败')
    } finally {
      setTesting(false)
    }
  }

  const statusText =
    status.state === 'syncing'
      ? '同步中…'
      : status.state === 'error'
        ? status.message
        : !configured
          ? '未开启'
          : dev.lastSyncAt
            ? `上次同步 ${new Date(dev.lastSyncAt).toLocaleString('zh-CN', { hour12: false })}`
            : '尚未同步'

  return (
    <Section
      header="多设备同步"
      footer="iPhone、iPad、Mac 填同一个服务地址和口令即可共享进度。服务部署方法见项目 README 的「同步服务」一节。"
    >
      <Row title="状态" icon={<IconCloud />} iconBg="var(--teal)" value={statusText} />
      <label className="row">
        <span>服务地址</span>
        <input
          type="url"
          inputMode="url"
          placeholder="https://xxx.workers.dev"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      <label className="row">
        <span>口令</span>
        <input type="password" placeholder="SYNC_TOKEN" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
      </label>
      {changed ? (
        <Row title={testing ? '连接中…' : '测试并保存'} className="tint" onClick={testing ? undefined : save} />
      ) : (
        configured && (
          <Row title={status.state === 'syncing' ? '同步中…' : '立即同步'} className="tint" onClick={() => void syncNow()} />
        )
      )}
    </Section>
  )
}

function DataSection() {
  const fileRef = useRef<HTMLInputElement>(null)

  const doExport = async () => {
    const blob = await exportBackup()
    const name = `lexiglass-${new Date().toISOString().slice(0, 10)}.json`
    const file = new File([blob], name, { type: 'application/json' })
    // iOS 上优先用系统分享面板，可以直接存到「文件」或 iCloud 云盘
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name })
        return
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
      }
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const doImport = async (f?: File) => {
    if (!f) return
    try {
      const n = await importBackup(await f.text())
      haptic('success')
      toast(`已合并 ${n} 条记录`)
    } catch (e) {
      toast(e instanceof Error ? e.message : '导入失败')
    }
  }

  const wipe = async () => {
    if (!confirm('清空本机所有词书和学习记录？此操作不可撤销。已同步到服务器的数据不受影响。')) return
    await db.delete()
    location.reload()
  }

  return (
    <Section header="数据" footer="备份文件包含词书、学习进度和设置。导入时同一条记录保留较新的版本，不会覆盖更新的进度。">
      <Row title="导出备份" icon={<IconUpload />} iconBg="var(--blue)" className="tint" onClick={doExport} />
      <Row title="从备份恢复" icon={<IconDownload />} iconBg="var(--green)" className="tint" onClick={() => fileRef.current?.click()} />
      <Row title="清空本机数据" icon={<IconTrash />} iconBg="var(--red)" className="destructive" onClick={wipe} />
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => doImport(e.target.files?.[0])} />
    </Section>
  )
}
