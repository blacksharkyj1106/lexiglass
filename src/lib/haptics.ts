/**
 * iOS Safari 不支持 navigator.vibrate。iOS 18 起，点击 <input type="checkbox" switch>
 * 的 label 会触发系统触感，这里借用这一行为。属于非官方技巧，失效时静默降级。
 */
let label: HTMLLabelElement | null = null
let enabled = true

export function setHapticsEnabled(v: boolean) {
  enabled = v
}

function ensure() {
  if (label) return label
  label = document.createElement('label')
  label.setAttribute('aria-hidden', 'true')
  label.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('switch', '')
  input.tabIndex = -1
  label.appendChild(input)
  document.body.appendChild(label)
  return label
}

export function haptic(kind: 'light' | 'success' | 'warning' = 'light') {
  if (!enabled) return
  if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
    navigator.vibrate(kind === 'light' ? 8 : kind === 'success' ? [10, 40, 10] : [20, 60, 20])
    return
  }
  try {
    ensure().click()
  } catch {
    /* noop */
  }
}
