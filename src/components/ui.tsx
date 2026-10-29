import { AnimatePresence, motion, type PanInfo } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib/haptics'
import { IconChevronLeft, IconChevronRight } from './Icons'

const spring = { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 } as const

// ---------- 导航栏 + 大标题 ----------

export function useScrolled(threshold = 44) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > threshold)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [threshold])
  return scrolled
}

export function NavBar(props: {
  title: string
  large?: boolean
  subtitle?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
}) {
  const scrolled = useScrolled()
  const cls = props.large ? (scrolled ? 'navbar compact' : 'navbar') : 'navbar always'
  return (
    <>
      <header className={cls}>
        <div className="navbar-inner">
          <div className="navbar-side">{props.leading}</div>
          <div className="navbar-title">{props.title}</div>
          <div className="navbar-side end">{props.trailing}</div>
        </div>
      </header>
      {props.large && (
        <div className="page">
          <h1 className="large-title">{props.title}</h1>
          {props.subtitle && <div className="large-sub">{props.subtitle}</div>}
        </div>
      )}
    </>
  )
}

export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="text-btn" onClick={onClick} style={{ marginLeft: -6 }}>
      <IconChevronLeft width={20} height={20} />
      {label}
    </button>
  )
}

// ---------- 列表 ----------

export function Section(props: { header?: ReactNode; footer?: ReactNode; big?: boolean; children: ReactNode }) {
  return (
    <section className="section">
      {props.header && <div className={props.big ? 'section-header big' : 'section-header'}>{props.header}</div>}
      <div className="group">{props.children}</div>
      {props.footer && <div className="section-footer">{props.footer}</div>}
    </section>
  )
}

export function Row(props: {
  title: ReactNode
  sub?: ReactNode
  value?: ReactNode
  icon?: ReactNode
  iconBg?: string
  chevron?: boolean
  onClick?: () => void
  className?: string
  children?: ReactNode
}) {
  const content = (
    <>
      {props.icon && (
        <span className="row-icon" style={{ background: props.iconBg ?? 'var(--tint)' }}>
          {props.icon}
        </span>
      )}
      <div className="row-main">
        <div className="row-title">{props.title}</div>
        {props.sub && <div className="row-sub">{props.sub}</div>}
      </div>
      {props.value != null && <span className="row-value">{props.value}</span>}
      {props.children}
      {props.chevron && <IconChevronRight className="row-chevron" />}
    </>
  )
  const cls = `row${props.icon ? ' has-icon' : ''}${props.className ? ` ${props.className}` : ''}`
  return props.onClick ? (
    <button className={cls} onClick={props.onClick}>
      {content}
    </button>
  ) : (
    <div className={cls}>{content}</div>
  )
}

// ---------- 控件 ----------

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      className="switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => {
        haptic()
        onChange(!checked)
      }}
    />
  )
}

let segId = 0
export function Segmented<T extends string>(props: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  const [id] = useState(() => `seg-${segId++}`)
  return (
    <div className="segmented" role="tablist">
      {props.options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === props.value}
          onClick={() => {
            haptic()
            props.onChange(o.value)
          }}
        >
          {o.value === props.value && <motion.span layoutId={id} className="seg-thumb" transition={spring} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Stepper(props: { value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const set = (v: number) => {
    const next = Math.min(props.max, Math.max(props.min, v))
    if (next !== props.value) {
      haptic()
      props.onChange(next)
    }
  }
  return (
    <div className="stepper">
      <button aria-label="减少" onClick={() => set(props.value - props.step)}>
        −
      </button>
      <button aria-label="增加" onClick={() => set(props.value + props.step)}>
        +
      </button>
    </div>
  )
}

export function ProgressRing(props: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const size = props.size ?? 120
  const stroke = props.stroke ?? 12
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, props.value))
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--fill-3)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={props.color ?? 'var(--tint)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ type: 'spring', stiffness: 80, damping: 20 }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{props.children}</div>
    </div>
  )
}

// ---------- Sheet ----------

export function Sheet(props: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  children: ReactNode
}) {
  const [wide, setWide] = useState(() => matchMedia('(min-width: 768px)').matches)
  useEffect(() => {
    const mq = matchMedia('(min-width: 768px)')
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  useEffect(() => {
    if (!props.open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [props.open, props.onClose])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) props.onClose()
  }

  return createPortal(
    <AnimatePresence>
      {props.open && (
        <>
          <motion.div
            key="dim"
            className="sheet-dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={props.onClose}
          />
          <div className="sheet-wrap" key="wrap">
            <motion.div
              className="sheet"
              role="dialog"
              aria-modal="true"
              initial={wide ? { opacity: 0, scale: 0.94 } : { y: '100%' }}
              animate={wide ? { opacity: 1, scale: 1 } : { y: 0 }}
              exit={wide ? { opacity: 0, scale: 0.96 } : { y: '100%' }}
              transition={spring}
              drag={wide ? false : 'y'}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              dragListener
              onDragEnd={onDragEnd}
            >
              <div className="sheet-grabber" />
              <div className="sheet-head">
                <div>{props.leading}</div>
                <h3>{props.title}</h3>
                <div style={{ justifySelf: 'end' }}>{props.trailing}</div>
              </div>
              <div className="sheet-body" onPointerDown={(e) => e.stopPropagation()}>
                {props.children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}

// ---------- Toast ----------

let pushToast: ((msg: string) => void) | null = null
export function toast(msg: string) {
  pushToast?.(msg)
}

export function ToastHost() {
  const [msg, setMsg] = useState<{ text: string; id: number } | null>(null)
  useEffect(() => {
    pushToast = (text) => setMsg({ text, id: Date.now() })
    return () => {
      pushToast = null
    }
  }, [])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 2200)
    return () => clearTimeout(t)
  }, [msg])
  return createPortal(
    <AnimatePresence>
      {msg && (
        <motion.div
          key={msg.id}
          className="toast glass glass-strong"
          initial={{ opacity: 0, y: -20, x: '-50%', scale: 0.9 }}
          animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
          exit={{ opacity: 0, y: -20, x: '-50%', scale: 0.95 }}
          transition={spring}
        >
          {msg.text}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
