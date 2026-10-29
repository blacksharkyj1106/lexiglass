import { motion } from 'motion/react'
import { useEffect, type ComponentType, type SVGProps } from 'react'
import { IconBooks, IconChart, IconGear, IconToday } from './components/Icons'
import { ToastHost } from './components/ui'
import { db, requestPersistence } from './lib/db'
import { haptic, setHapticsEnabled } from './lib/haptics'
import { navigate, useRoute } from './lib/router'
import { useSettings } from './lib/settings'
import { scheduleSync, syncNow } from './lib/sync'
import { unlockAudio } from './lib/tts'
import BookDetail from './pages/BookDetail'
import Books from './pages/Books'
import Settings from './pages/Settings'
import Stats from './pages/Stats'
import Study from './pages/Study'
import Today from './pages/Today'

type Tab = { path: string; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }
const TABS: Tab[] = [
  { path: '/today', label: '今日', Icon: IconToday },
  { path: '/books', label: '词书', Icon: IconBooks },
  { path: '/stats', label: '统计', Icon: IconChart },
  { path: '/settings', label: '设置', Icon: IconGear },
]

function useTheme() {
  const { theme, haptics } = useSettings()
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#000000' : '#f2f2f7'))
  }, [theme])
  useEffect(() => setHapticsEnabled(haptics), [haptics])
}

/** 自动同步：启动时、回到前台时、切到后台前、有本地修改后 */
function useAutoSync() {
  useEffect(() => {
    void syncNow()
    const onVis = () => void syncNow()
    const onOnline = () => void syncNow()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onOnline)
    const hooks = (['cards', 'logs', 'books', 'kv'] as const).map((t) => {
      const table = db.table(t)
      // 只有产生未同步修改的写入才触发；同步自身写回 dirty=0 不触发，避免循环
      const onCreate = (_k: unknown, obj: { dirty?: number }) => {
        if (obj.dirty === 1) scheduleSync()
      }
      const onUpdate = (mods: { dirty?: number }, _k: unknown, obj: { dirty?: number }) => {
        if ((mods.dirty ?? obj.dirty) === 1) scheduleSync()
      }
      table.hook('creating', onCreate)
      table.hook('updating', onUpdate)
      return () => {
        table.hook('creating').unsubscribe(onCreate)
        table.hook('updating').unsubscribe(onUpdate)
      }
    })
    const timer = setInterval(() => document.visibilityState === 'visible' && void syncNow(), 5 * 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', onOnline)
      hooks.forEach((off) => off())
      clearInterval(timer)
    }
  }, [])
}

function TabBar({ active }: { active: string }) {
  return (
    <nav className="tabbar glass" aria-label="主导航">
      {TABS.map(({ path, label, Icon }) => (
        <button
          key={path}
          aria-current={active === path ? 'page' : undefined}
          onClick={() => {
            haptic()
            navigate(path, true)
            window.scrollTo({ top: 0 })
          }}
        >
          {active === path && (
            <motion.span layoutId="tab-pill" className="tab-pill" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
          )}
          <Icon />
          {label}
        </button>
      ))}
    </nav>
  )
}

function Sidebar({ active }: { active: string }) {
  return (
    <aside className="sidebar glass">
      <h2>
        <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
        LexiGlass
      </h2>
      <nav aria-label="主导航">
        {TABS.map(({ path, label, Icon }) => (
          <button key={path} aria-current={active === path ? 'page' : undefined} onClick={() => navigate(path, true)}>
            <Icon />
            {label}
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">⌘1–4 切换页面 · 空格开始学习</div>
    </aside>
  )
}

export default function App() {
  const route = useRoute()
  useTheme()
  useAutoSync()

  useEffect(() => {
    void requestPersistence()
    // iOS 只允许在用户手势里首次出声
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  // Mac / iPad 键盘：⌘1–4 切换标签页
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const i = Number(e.key) - 1
      if (i >= 0 && i < TABS.length) {
        e.preventDefault()
        navigate(TABS[i].path, true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const studying = route.startsWith('/study')
  const tab = TABS.find((t) => route.startsWith(t.path))?.path ?? '/today'

  let page
  if (route.startsWith('/books/')) page = <BookDetail id={decodeURIComponent(route.slice(7))} />
  else if (tab === '/books') page = <Books />
  else if (tab === '/stats') page = <Stats />
  else if (tab === '/settings') page = <Settings />
  else page = <Today />

  return (
    <>
      <div className="backdrop" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <div className="app">
        <Sidebar active={tab} />
        <main className="main" key={route.startsWith('/books/') ? 'detail' : tab}>
          {page}
        </main>
        <TabBar active={tab} />
      </div>
      {studying && <Study />}
      <ToastHost />
    </>
  )
}
