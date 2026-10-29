import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type { DeviceSettings, Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  dailyNew: 20,
  maxReviews: 200,
  retention: 0.9,
  activeBooks: [],
  newOrder: 'book',
  direction: 'en-zh',
  autoSpeak: true,
  accent: 'us',
  voiceSource: 'auto',
  rate: 0.9,
  haptics: true,
  showEnglish: false,
  theme: 'system',
}

export const DEFAULT_DEVICE: DeviceSettings = {
  syncUrl: '',
  syncToken: '',
  voiceName: '',
  lastSyncAt: 0,
  syncCursor: 0,
}

const SETTINGS_KEY = 'settings'
const DEVICE_KEY = 'device'

export async function getSettings(): Promise<Settings> {
  const rec = await db.kv.get(SETTINGS_KEY)
  return { ...DEFAULT_SETTINGS, ...(rec?.v as Partial<Settings> | undefined) }
}

export async function updateSettings(patch: Partial<Settings>) {
  await db.transaction('rw', db.kv, async () => {
    const cur = await getSettings()
    await db.kv.put({ k: SETTINGS_KEY, v: { ...cur, ...patch }, updatedAt: Date.now(), dirty: 1 })
  })
}

export async function getDevice(): Promise<DeviceSettings> {
  const rec = await db.kv.get(DEVICE_KEY)
  return { ...DEFAULT_DEVICE, ...(rec?.v as Partial<DeviceSettings> | undefined) }
}

/** 本机配置不同步，dirty 恒为 0 */
export async function updateDevice(patch: Partial<DeviceSettings>) {
  await db.transaction('rw', db.kv, async () => {
    const cur = await getDevice()
    await db.kv.put({ k: DEVICE_KEY, v: { ...cur, ...patch }, updatedAt: Date.now(), dirty: 0 })
  })
}

export const isLocalKv = (k: string) => k === DEVICE_KEY

export function useSettings(): Settings {
  return useLiveQuery(getSettings, [], DEFAULT_SETTINGS)
}

export function useDevice(): DeviceSettings {
  return useLiveQuery(getDevice, [], DEFAULT_DEVICE)
}
