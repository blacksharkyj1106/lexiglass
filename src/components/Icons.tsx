import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>
const base = (p: P) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...p,
})

// 近似 SF Symbols 的线条图标
export const IconToday = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="4.5" width="17" height="16" rx="3.5" />
    <path d="M3.5 9.5h17M8 2.8v3.4M16 2.8v3.4" />
    <path d="m9 14.6 2 2 4-4.2" />
  </svg>
)
export const IconBooks = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H9a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H4z" />
    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H15a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H20z" />
  </svg>
)
export const IconChart = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 20V12M10 20V6M15 20v-9M20 20V4" />
  </svg>
)
export const IconGear = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8.96 4.6 1.7 1.7 0 0 0 10 3.04V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.32.43.56.77.66.17.05.35.07.53.07H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.27z" />
  </svg>
)
export const IconSpeaker = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" stroke="none" />
    <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.5a7.8 7.8 0 0 1 0 11" />
  </svg>
)
export const IconClose = (p: P) => (
  <svg {...base({ strokeWidth: 2.3, ...p })}>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </svg>
)
export const IconUndo = (p: P) => (
  <svg {...base({ strokeWidth: 2.1, ...p })}>
    <path d="M9 14 4.5 9.5 9 5" />
    <path d="M4.5 9.5H15a5 5 0 0 1 0 10h-3" />
  </svg>
)
export const IconPlus = (p: P) => (
  <svg {...base({ strokeWidth: 2.3, ...p })}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
export const IconChevronRight = (p: P) => (
  <svg {...base({ strokeWidth: 2.6, ...p })}>
    <path d="m9 5 7 7-7 7" />
  </svg>
)
export const IconChevronLeft = (p: P) => (
  <svg {...base({ strokeWidth: 2.6, ...p })}>
    <path d="m15 5-7 7 7 7" />
  </svg>
)
export const IconChevronUp = (p: P) => (
  <svg {...base({ strokeWidth: 2.4, ...p })}>
    <path d="m6 15 6-6 6 6" />
  </svg>
)
export const IconChevronDown = (p: P) => (
  <svg {...base({ strokeWidth: 2.4, ...p })}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)
export const IconSearch = (p: P) => (
  <svg {...base({ strokeWidth: 2.2, ...p })}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 4.5 4.5" />
  </svg>
)
export const IconCheck = (p: P) => (
  <svg {...base({ strokeWidth: 2.6, ...p })}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
)
export const IconDownload = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M5 19.5h14" />
  </svg>
)
export const IconUpload = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14" />
  </svg>
)
export const IconTrash = (p: P) => (
  <svg {...base(p)}>
    <path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l.9 13a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-13" />
  </svg>
)
export const IconBolt = (p: P) => (
  <svg {...base(p)}>
    <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z" fill="currentColor" stroke="none" />
  </svg>
)
export const IconFlame = (p: P) => (
  <svg {...base(p)}>
    <path
      d="M12 21.5c-4 0-7-2.8-7-6.6 0-3.4 2.3-5.3 3.6-7.7.4 1.6 1.2 2.7 2.2 3.3.4-3.3 1.8-6 4.2-7.9-.3 3 .8 4.9 2.2 6.6 1.2 1.5 1.8 3.1 1.8 5.4 0 4-3 6.9-7 6.9z"
      fill="currentColor"
      stroke="none"
    />
  </svg>
)
export const IconCloud = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4.5 4.5 0 0 1-.5 10z" />
  </svg>
)
export const IconSync = (p: P) => (
  <svg {...base(p)}>
    <path d="M19.5 9A7.5 7.5 0 0 0 6 6.6L4.5 8M4.5 4v4h4M4.5 15A7.5 7.5 0 0 0 18 17.4l1.5-1.4M19.5 20v-4h-4" />
  </svg>
)
export const IconSparkle = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z" fill="currentColor" stroke="none" />
  </svg>
)
export const IconScissors = (p: P) => (
  <svg {...base(p)}>
    <circle cx="6" cy="6.5" r="2.6" />
    <circle cx="6" cy="17.5" r="2.6" />
    <path d="M8.2 8 20 18M8.2 16 20 6" />
  </svg>
)
export const IconRotate = (p: P) => (
  <svg {...base(p)}>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9M4.5 4.5V9H9" />
  </svg>
)
export const IconWave = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
  </svg>
)
export const IconPaint = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none" />
  </svg>
)
export const IconBrain = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 4.5a3 3 0 0 0-3 3v.3A3.2 3.2 0 0 0 4 10.8a3.2 3.2 0 0 0 1 2.3 3.3 3.3 0 0 0 2 5.4 3 3 0 0 0 5 1.5V6a3 3 0 0 0-3-1.5z" />
    <path d="M15 4.5a3 3 0 0 1 3 3v.3a3.2 3.2 0 0 1 2 3 3.2 3.2 0 0 1-1 2.3 3.3 3.3 0 0 1-2 5.4 3 3 0 0 1-5 1.5" />
  </svg>
)
export const IconInfo = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 7.6v.2" strokeWidth={2.3} />
  </svg>
)
export const IconArrowUpDown = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 4v16M4.5 7.5 8 4l3.5 3.5M16 20V4M12.5 16.5 16 20l3.5-3.5" />
  </svg>
)
