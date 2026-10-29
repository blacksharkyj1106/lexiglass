import { getDevice, getSettings } from './settings'

/**
 * 朗读策略：
 * - online：有道真人发音（非官方接口，可能失效）
 * - system：系统 TTS（离线可用；iOS 下载「增强」语音后音质更好）
 * - auto：在线时用真人发音，失败或离线回退到系统 TTS
 *
 * iOS 要求首次出声必须在用户点击中触发，所以复用同一个 <audio>，
 * 在第一次点击时 unlock()。
 */

let audio: HTMLAudioElement | null = null
let unlocked = false

function getAudio() {
  audio ??= new Audio()
  audio.preload = 'auto'
  return audio
}

/** 0.05 秒静音 WAV，用来在用户手势里解锁 <audio> */
const SILENT = (() => {
  const samples = 400
  const buf = new DataView(new ArrayBuffer(44 + samples))
  const str = (o: number, t: string) => [...t].forEach((c, i) => buf.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  buf.setUint32(4, 36 + samples, true)
  str(8, 'WAVEfmt ')
  buf.setUint32(16, 16, true)
  buf.setUint16(20, 1, true)
  buf.setUint16(22, 1, true)
  buf.setUint32(24, 8000, true)
  buf.setUint32(28, 8000, true)
  buf.setUint16(32, 1, true)
  buf.setUint16(34, 8, true)
  str(36, 'data')
  buf.setUint32(40, samples, true)
  for (let i = 0; i < samples; i++) buf.setUint8(44 + i, 128)
  let bin = ''
  new Uint8Array(buf.buffer).forEach((b) => (bin += String.fromCharCode(b)))
  return `data:audio/wav;base64,${btoa(bin)}`
})()

export function unlockAudio() {
  if (unlocked) return
  unlocked = true
  const a = getAudio()
  a.src = SILENT
  a.play().catch(() => {})
  try {
    // 同样需要在手势里「唤醒」speechSynthesis
    const u = new SpeechSynthesisUtterance('')
    u.volume = 0
    speechSynthesis.speak(u)
  } catch {
    /* 不支持 */
  }
}

let voicesCache: SpeechSynthesisVoice[] = []
function loadVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return []
  const v = speechSynthesis.getVoices()
  if (v.length) voicesCache = v
  return voicesCache
}
if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices)
  loadVoices()
}

/** 英语语音列表，高品质语音排前面 */
export function englishVoices(): SpeechSynthesisVoice[] {
  const score = (v: SpeechSynthesisVoice) =>
    (/premium|enhanced|高品质|增强/i.test(v.name) ? 0 : 10) + (v.localService ? 0 : 5) + (/novelty|bells|bad news|boing|bubbles|whisper|zarvox|trinoids|jester|organ|cellos|albert|superstar|wobble|good news/i.test(v.name) ? 100 : 0)
  return loadVoices()
    .filter((v) => /^en[-_]/i.test(v.lang))
    .sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name))
}

function pickVoice(accent: 'us' | 'uk', preferred: string): SpeechSynthesisVoice | undefined {
  const voices = englishVoices()
  if (preferred) {
    const v = voices.find((x) => x.name === preferred)
    if (v) return v
  }
  const lang = accent === 'uk' ? /en[-_]GB/i : /en[-_]US/i
  return voices.find((v) => lang.test(v.lang)) ?? voices[0]
}

function speakSystem(text: string, accent: 'us' | 'uk', rate: number, voiceName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof speechSynthesis === 'undefined') return reject(new Error('不支持系统朗读'))
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    const v = pickVoice(accent, voiceName)
    if (v) u.voice = v
    u.lang = v?.lang ?? (accent === 'uk' ? 'en-GB' : 'en-US')
    u.rate = rate
    u.onend = () => resolve()
    u.onerror = (e) => reject(new Error(e.error))
    speechSynthesis.speak(u)
  })
}

function speakOnline(text: string, accent: 'us' | 'uk', rate: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const a = getAudio()
    const type = accent === 'uk' ? 1 : 2
    a.onended = () => resolve()
    a.onerror = () => reject(new Error('在线发音加载失败'))
    a.src = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=${type}`
    a.playbackRate = Math.max(0.5, Math.min(1.5, rate))
    a.play().catch(reject)
  })
}

let seq = 0

export async function speak(text: string) {
  const id = ++seq
  const [s, d] = await Promise.all([getSettings(), getDevice()])
  if (id !== seq) return
  stopSpeaking()
  const online = s.voiceSource === 'online' || (s.voiceSource === 'auto' && navigator.onLine)
  if (online) {
    try {
      await speakOnline(text, s.accent, s.rate)
      return
    } catch {
      if (s.voiceSource === 'online' || id !== seq) return
    }
  }
  await speakSystem(text, s.accent, s.rate, d.voiceName).catch(() => {})
}

export function stopSpeaking() {
  try {
    speechSynthesis.cancel()
  } catch {
    /* noop */
  }
  if (audio && !audio.paused && audio.src !== SILENT) audio.pause()
}
