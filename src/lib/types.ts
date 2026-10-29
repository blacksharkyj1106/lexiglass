export interface WordEntry {
  /** 小写主键 */
  k: string
  /** 原始拼写 */
  w: string
  /** 音标 */
  p?: string
  /** 中文释义，多行 */
  t: string
  /** 英文释义，多行 */
  d?: string
  /** ECDICT 词形变化，如 p:perceived/d:perceived/3:perceives */
  x?: string
}

export type Synced = {
  updatedAt: number
  /** 1 = 有未同步的修改 */
  dirty: 0 | 1
}

export interface Book extends Synced {
  id: string
  name: string
  desc?: string
  builtin: boolean
  /** 单词主键，按学习顺序排列 */
  words: string[]
  /** 导入词书自带的词条（内置词书从静态文件加载） */
  entries?: WordEntry[]
  createdAt: number
  deleted?: 0 | 1
}

/** FSRS 卡片，日期以毫秒存储 */
export interface FsrsData {
  stability: number
  stabilityFast: number
  difficulty: number
  dueAt: number
  lastReviewAt: number | null
  state: number
  scheduleStatus: string
  cardId: string
  reps: number
  lapses: number
  scheduledDays: number
  learningStep: number
}

export interface CardRecord extends Synced {
  k: string
  due: number
  state: number
  /** 1 = 已斩（标记为熟知，不再出现） */
  suspended: 0 | 1
  fsrs: FsrsData
}

export interface ReviewLogRecord extends Synced {
  id: string
  k: string
  rating: number
  /** 评分前的状态 */
  prevState: number
  at: number
  /** 学习日 YYYY-MM-DD（以凌晨 4 点为界） */
  day: string
  /** 作答用时 */
  ms: number
}

export interface KvRecord<T = unknown> extends Synced {
  k: string
  v: T
}

export type Direction = 'en-zh' | 'zh-en'
export type VoiceSource = 'auto' | 'online' | 'system'
export type Theme = 'system' | 'light' | 'dark'
export type NewOrder = 'book' | 'random'

export interface Settings {
  dailyNew: number
  maxReviews: number
  retention: number
  activeBooks: string[]
  newOrder: NewOrder
  direction: Direction
  autoSpeak: boolean
  accent: 'us' | 'uk'
  voiceSource: VoiceSource
  rate: number
  haptics: boolean
  showEnglish: boolean
  theme: Theme
}

/** 仅保存在本机、不参与同步的配置 */
export interface DeviceSettings {
  syncUrl: string
  syncToken: string
  voiceName: string
  lastSyncAt: number
  syncCursor: number
}
