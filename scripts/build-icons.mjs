// 用 Playwright 把 public/icons/icon.svg 渲染成 PWA / iOS 所需的 PNG 图标
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const { chromium } = createRequire(import.meta.url)('playwright')

const dir = join(import.meta.dirname, '..', 'public', 'icons')
const svg = readFileSync(join(dir, 'icon.svg'), 'utf8')
const targets = [
  ['apple-touch-icon.png', 180, 0],
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['icon-maskable-512.png', 512, 0.1],
]

const browser = await chromium.launch()
const page = await browser.newPage()
for (const [name, size, pad] of targets) {
  await page.setViewportSize({ width: size, height: size })
  const inner = Math.round(size * (1 - pad * 2))
  await page.setContent(
    `<html><body style="margin:0;background:#5856D6;display:grid;place-items:center;width:${size}px;height:${size}px">
      <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div>
    </body></html>`,
  )
  await page.screenshot({ path: join(dir, name), omitBackground: false })
  console.log(name)
}
await browser.close()
