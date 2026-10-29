# LexiGlass 交接说明（给接手的 AI）

你接手的是一个已经能用的项目，不是从零开始。**先读代码再动手，不要重写。**

## 1. 项目是什么

LexiGlass：iOS 风格的背单词 PWA，用户在 iPhone / iPad / Mac 上「添加到主屏幕」使用。用户在备考**英语六级**，用中文交流，喜欢直接、犀利的反馈，有不足可以直说。

- 仓库：`blacksharkyj1106/lexiglass`
- 开发分支：`claude/ios-word-memory-app-w3aat4`（先确认它是否已合并进 `main`，以 `main` 为准）
- 部署：GitHub Pages，路径 `/lexiglass/`（`.github/workflows/deploy.yml`）
- 同步服务：Cloudflare Worker + D1（`worker/`、`.github/workflows/sync-worker.yml`）

## 2. 开工前必读（按顺序）

1. `README.md`：功能、部署、同步配置步骤
2. `docs/PLAN.md`：设计决定和里程碑
3. `src/lib/types.ts`：数据模型
4. `src/lib/db.ts`、`src/lib/srs.ts`、`src/lib/queue.ts`、`src/lib/sync.ts`：核心逻辑
5. `worker/src/index.js`、`tests/worker.test.mjs`：同步协议和测试

## 3. 技术栈

React 19 + TypeScript + Vite 8 + vite-plugin-pwa；Dexie（IndexedDB）+ dexie-react-hooks；ts-fsrs 6（FSRS-7 模型）；motion（动画/手势）；样式是手写 CSS + CSS 变量（`src/styles/`），没有 UI 库。路由是自写的 hash 路由（`src/lib/router.ts`）。

## 4. 不能随便改的东西（改了会丢数据或破坏同步）

- **数据库结构**：Dexie schema 在 `src/lib/db.ts`。要加表或索引，必须新增 `db.version(2)`，不能直接改 version(1)。
- **同步字段**：`books`、`cards`、`logs`、`kv` 四张表的每条记录都带 `updatedAt`（毫秒）和 `dirty`（0/1）。任何本地修改都必须写 `updatedAt: Date.now(), dirty: 1`，否则不会同步。
- **删除用墓碑，不真删**：卡片重置/撤销 → `state: -1`；复习日志撤销 → `rating: 0`；词书删除 → `deleted: 1`。读取时用 `isLiveCard`、`isLiveLog` 过滤。
- **`kv` 里的 `device` 键只存本机**（同步地址、口令、语音、同步游标），永远不能被同步出去，见 `isLocalKv`。
- **主键**：`books`/`logs` 用 `id`，`cards`/`kv`/`words` 用 `k`。单词主键是小写拼写。
- **同步协议**（`worker/src/index.js`）：`POST /sync {cursor, changes:[{t,k,v,u}]}` → `{cursor, changes, more}`，服务端只接受 `u` 更大的版本（last-write-wins），`seq` 递增。改协议要同时改客户端、服务端和测试，并保证旧客户端不坏。
- **FSRS 卡片**存在 `CardRecord.fsrs`，日期存毫秒数，进出 ts-fsrs 时用 `srs.ts` 里的 `toFsrs` / `fromFsrs` 转换。
- **`public/data/` 是脚本生成的**（`scripts/build-dict.mjs`，数据源 ECDICT），不要手改 JSON；要改就改脚本再重新生成。
- **Vite `base` 是 `/lexiglass/`**，代码里引用静态资源用 `import.meta.env.BASE_URL`。

## 5. iOS / Safari 限制（别踩）

- Safari 不支持 `navigator.vibrate`；触感用的是 `src/lib/haptics.ts` 里 iOS 18 switch 控件的技巧
- `backdrop-filter` 可以用，但 `backdrop-filter: url(#svg-filter)` 不行，所以做不了液态玻璃折射
- 首次出声必须在用户手势里（见 `src/lib/tts.ts` 的 `unlockAudio`）
- 注意安全区：`env(safe-area-inset-*)`；页面要在 iPhone 竖屏、iPad 横竖屏、Mac 宽窗口下都正常
- 深色模式三处都要改：`:root`、`@media (prefers-color-scheme: dark)` 下的 `:root:not([data-theme='light'])`、`:root[data-theme='dark']`（见 `src/styles/tokens.css`）

## 6. 风格约定

- 界面文案、代码注释都用中文，注释少而精，跟现有代码保持一致
- 颜色只用 `tokens.css` 里的变量，不写死色值
- 新组件优先复用 `src/components/ui.tsx`（NavBar、Section、Row、Switch、Segmented、Stepper、Sheet、toast）
- 不要为一点小功能引入新依赖

## 7. 每次改完必须做

```bash
npm ci
npm run build   # 包含 tsc 类型检查
npm test        # 同步服务测试（node:test + node:sqlite）
```

两条都通过才能提交。改了界面的话，用 iPhone 尺寸（390×844）和 iPad 横屏尺寸各看一遍，浅色、深色都看。提交到功能分支，不要直接推 `main`，除非用户明确要求。

**如果你的 GitHub 连接器只能读、不能提交**：不要假装改好了。直接输出完整的文件内容或 unified diff，并标明文件路径，让用户自己提交或交给能写仓库的工具。

## 8. 当前状态与待办

已完成：今日页、学习页（翻面 / 四档评分 / 滑动 / 撤销 / 斩 / 快捷键）、8 本内置词书、导入（变形还原 + 拼写建议）、朗读、统计（热力图 / 30 天预测 / 状态分布）、设置、备份导入导出、同步客户端与服务端。

用户那边还没做（需要用户自己操作）：
- 合并分支到 `main`；仓库改为 Public；Pages 的 Source 选 GitHub Actions
- 按 README 配置 Cloudflare 和 4 个仓库 Secrets，然后运行 *Deploy sync worker*

已知问题 / 可改进：
- 主包约 560 KB（gzip 179 KB），可以改用 motion 的 `LazyMotion` + `m` 组件瘦身
- 导入拼写建议只按编辑距离排序（`underly` 的建议里 `underlay` 排在 `underlie` 前面），可以结合词频排序
- 没有例句（ECDICT 不含）
- 没有每日复习提醒（iOS 主屏幕 Web App 支持 Web Push，但需要推送服务）
- 「30 天记忆保持率」需要至少 10 次复习才显示

可选功能（M5）：拼写模式、例句、用用户自己的复习记录优化 FSRS 参数、按词频或标签筛词。
