import { useSyncExternalStore } from 'react'

const read = () => location.hash.replace(/^#/, '') || '/today'

export function useRoute(): string {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb)
      return () => window.removeEventListener('hashchange', cb)
    },
    read,
  )
}

/** 应用内前进的层数，用来判断「返回」能否交给浏览器历史 */
let depth = 0

export function navigate(path: string, replace = false) {
  if (read() === path) return
  if (replace) location.replace(`#${path}`)
  else {
    depth++
    location.hash = path
  }
}

/** 有应用内历史就后退，没有（例如直接打开深链接）就跳到 fallback */
export function goBack(fallback: string) {
  if (depth > 0) {
    depth--
    history.back()
  } else navigate(fallback, true)
}
