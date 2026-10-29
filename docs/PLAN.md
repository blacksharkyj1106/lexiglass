# LexiGlass — 背单词 PWA 实施计划

> 状态：M0–M4 已完成（见第 9 节）。第 10 节的问题已拍板：同步选 B，仓库公开 + GitHub Pages，目标六级。

## 1. 目标与边界

| 要 | 不要（至少 v1 不要） |
|---|---|
| iPhone / iPad / Mac 三端可用，能「添加到主屏幕 / 添加到程序坞」当 App 用 | App Store 原生 App |
| iOS 原生质感：SF 字体、系统色、大标题、底部 Tab、Sheet、弹簧动画、深色模式 | 自造一套「好看但不像 iOS」的设计语言 |
| 科学的复习调度（记忆曲线） | 社交、排行榜、打卡分享 |
| 单词朗读 | 自己录音 / 付费 TTS |
| 内置词书 + 导入你自己的词库 | 在线词典爬虫 |
| 离线可用 | 强依赖服务器 |

## 2. 技术选型

| 层 | 选择 | 理由 |
|---|---|---|
| 形态 | **PWA**（Web App Manifest + Service Worker） | iOS 16.4+ / iPadOS / macOS Sonoma Safari 都能装成独立窗口 App，离线可用，不用上架 |
| 框架 | **Vite + React + TypeScript** | 生态最全；手势/动画库成熟 |
| 动画手势 | **Motion（framer-motion）** | 弹簧物理、拖拽手势，做卡片左右滑评分、Sheet 下拉关闭 |
| 样式 | 手写 CSS + CSS 变量（设计 token） | iOS 质感靠细节，UI 库反而碍事 |
| 本地存储 | **IndexedDB（Dexie）** | 几万条单词 + 复习日志，localStorage 装不下 |
| 调度算法 | **FSRS（ts-fsrs）** | 见第 4 节 |
| 朗读 | **Web Speech API** + 在线发音兜底 | 见第 5 节 |
| 部署 | **Cloudflare Pages**（或 GitHub Pages） | 必须 HTTPS 才能用 Service Worker；见「待你拍板」#3 |

## 3. UI / 交互设计

### 3.1 iOS 原生感的具体手段
- 字体：`-apple-system, "SF Pro", "PingFang SC"`，字号阶梯照抄 iOS Dynamic Type（Large Title 34 / Title 28 / Body 17 / Caption 12）。
- 颜色：iOS 系统色（systemBlue `#007AFF`、systemGroupedBackground 等），浅/深色两套 token，跟随系统。
- 布局：`viewport-fit=cover` + `env(safe-area-inset-*)` 处理刘海和 Home 条；`apple-mobile-web-app-status-bar-style` 透明状态栏。
- 组件：Large Title 导航栏（滚动收缩）、Inset Grouped 列表、底部 Tab Bar、可下拉关闭的 Sheet、Segmented Control、Switch。
- 动效：全部用弹簧曲线，不用线性/ease；尊重「减弱动态效果」(`prefers-reduced-motion`)。
- 去 Web 味：禁用长按选中/放大镜/点击高亮、`overscroll-behavior` 控制回弹、按压态缩放 0.97。
- 触感反馈：iOS Safari 不支持 `navigator.vibrate`。iOS 18+ 可用 `<input type="checkbox" switch>` 触发系统触感——**实验性 hack**，做成可选，失效不影响功能。

### 3.2 玻璃效果——先把话说清楚
- 能做到：`backdrop-filter: blur() saturate()` 的毛玻璃 + 边缘高光 + 内阴影，接近 iOS 15–18 的材质，Safari 支持且性能好。
- **做不到「完美」的 iOS 26 Liquid Glass**：它的核心是对背景的折射/透镜变形，Web 上只能靠 SVG 位移滤镜 + `backdrop-filter: url()`，而这一招 **Safari 不支持**（只有 Chromium 支持）。在你三台苹果设备上全部失效，等于白做。
- 原则：玻璃只用在**浮层**（Tab Bar、导航栏、Sheet、浮动按钮），**单词卡正文不用玻璃**——背单词是高强度阅读，透明底降低可读性，iOS 26 自己就因为这个被骂过。
- 低端设备 / 开启「降低透明度」时自动退化为实色背景。

### 3.3 三端布局
| 设备 | 布局 | 交互 |
|---|---|---|
| iPhone | 底部 Tab：今日 / 词书 / 统计 / 设置 | 点击翻卡，左右滑评分，底部 4 个评分按钮 |
| iPad | ≥ 768px 切换为左侧 Sidebar + 内容区（类 iPadOS 分栏）；卡片居中限宽 | 同上 + 妙控键盘快捷键 |
| Mac | 同 iPad 分栏；hover 态；窗口任意缩放 | 空格翻面、`1`–`4` 评分、`R` 重读、`⌘Z` 撤销上一次评分 |

### 3.4 主要页面
1. **今日**：待复习数 / 新词数 / 预计用时，一个大「开始」按钮；学习中的进度环。
2. **学习页**：正面——单词 + 音标 + 自动朗读；背面——词性释义、例句、词形变化（复数/过去式等）。评分按钮上直接显示下次间隔（如 `1 分钟 · 10 分钟 · 2 天 · 5 天`）。
3. **词书**：内置词书列表 + 我的导入；每本显示进度；可搜索、可单词「斩」（标记已掌握不再出现）。
4. **统计**：复习热力图（类 GitHub）、未来 30 天到期预测、记忆保持率、累计掌握数。
5. **设置**：每日新词上限、目标保持率、学习方向（英→中 / 中→英）、发音（英/美、语速、自动朗读开关）、备份/导入导出。

## 4. 记忆曲线（调度算法）

「艾宾浩斯曲线」是 1885 年的实验结论，不是算法；固定间隔表（1、2、4、7、15 天……）不管你对每个词掌握程度如何都一刀切，效率很差。用 **FSRS**：

- 每个词维护三个量：**难度 D**、**稳定性 S**（记忆衰减到 90% 所需天数）、**可提取性 R**（此刻还记得的概率）。
- 每次你评分（重来 / 困难 / 良好 / 简单），按模型更新 D、S，并把下次复习安排在 R 跌到**目标保持率**（默认 0.9，可调 0.8–0.95）的那一天。
- 这是 Anki 23.10 起的默认算法，有公开数据集验证，比 SM-2 同等保持率下少 20–30% 复习量。用现成库 `ts-fsrs`，不自己造轮子。
- 复习日志全量保存，攒够数据（约 1000 条以上）后可在本地**用你自己的数据重新拟合参数**（v2）。

### 每日队列规则
1. 先排**到期复习**，按可提取性 R 从低到高（最危险的先复习）。
2. **新词**按每日上限插入，默认每 4 个复习穿插 1 个新词，避免最后扎堆。
3. 当天答错 / 学习中的词，在本轮内隔 3–5 张卡后重现（短期学习步，1 分钟 / 10 分钟）。
4. 积压过多（如断更一周）时提供「只复习、暂停新词」模式。
5. 同一单词在多本词书中**共享一份进度**，不会重复学。

> 提醒：算法再好也取决于你评分是否诚实。看了答案才「想起来」的，就是「重来」。

## 5. 单词朗读

- 首选 `speechSynthesis`（系统 TTS）：离线、零成本；可选英音 / 美音、语速。iOS 上若在「设置 → 辅助功能 → 朗读内容 → 声音」下载了增强/高品质语音，网页也能用上，音质明显更好——设置页会给出引导。
- iOS 限制：第一次发音必须由用户点击触发，学习页「开始」按钮即解锁，之后可自动朗读。
- 兜底：系统语音不可用时，回退到在线真人发音（有道 `dictvoice` 接口，非官方，可能失效，仅作兜底）。
- 例句也可点击朗读。

## 6. 词库

### 6.1 内置词书
数据源：**ECDICT**（MIT 协议，约 77 万词条，含音标、中文释义、词形变化、柯林斯星级、词频，以及考试标签）。构建时按标签切出：

| 词书 | 约词量 |
|---|---|
| 中考 / 高考 | ~1.6k / ~3.7k |
| CET-4 / CET-6 | ~4k / ~5.4k |
| 考研 | ~4.8k |
| 雅思 / 托福 | ~5k / ~6.9k |
| GRE | ~7.5k |
| 高频词（按 BNC/当代语料词频前 N） | 可选 2k / 5k / 10k |

每本词书构建为独立 JSON 并压缩，**按需下载**，不把整部词典塞进首屏。

### 6.2 导入你自己的词库
支持格式（按你提供的样例最终确定）：
- `.txt`：一行一个单词——释义、音标自动从 ECDICT 补全（查词表约 5 万常用词，懒加载）。
- `.csv` / `.tsv`：`word, phonetic, meaning, example` 等列，导入时可手动映射列。
- `.json`：自定义结构。
- 查不到的词标记出来让你补全，而不是静默丢弃。

## 7. 数据模型（IndexedDB）

```ts
Word      { id, word, phonetic, pos, translation, definition?, exchange?, examples?, tags[] }
Book      { id, name, source: 'builtin'|'import', wordIds[], createdAt }
Card      { wordId, due, stability, difficulty, elapsedDays, scheduledDays,
            reps, lapses, state: New|Learning|Review|Relearning, lastReview?, suspended }
ReviewLog { id, wordId, rating, state, due, stability, difficulty, reviewedAt, durationMs }
Settings  { dailyNew, retention, direction, voice, rate, autoSpeak, ... }
```

## 8. 数据持久化与多设备

- 已知坑：iOS Safari 对**未添加到主屏幕**的网站，7 天不访问会清空本地数据。**必须添加到主屏幕使用**，并调用 `navigator.storage.persist()`。首次打开会引导安装。
- 三台设备的数据**默认互不相通**（每个 PWA 是独立存储）。方案见「待你拍板」#2。

## 9. 里程碑

| 阶段 | 内容 | 状态 |
|---|---|---|
| M0 骨架 | Vite 工程、PWA 清单与离线缓存、设计 token、Tab/Sidebar 外壳、深色模式、自动部署 | ✅ |
| M1 数据 | Dexie 数据层、ECDICT 构建脚本、8 本内置词书、导入器（变形还原、拼写建议） | ✅ |
| M2 学习 | FSRS-7 调度、每日队列、学习卡片（翻面/滑动/评分/撤销/斩）、朗读 | ✅ |
| M3 打磨 | iPad/Mac 分栏、键盘快捷键、玻璃材质、动效、触感 | ✅ |
| M4 统计与备份 | 热力图、到期预测、状态分布、JSON 导出/导入 | ✅ |
| 同步 | Cloudflare Worker + D1，记录级 last-write-wins 增量同步 | ✅ 代码完成，待部署 |
| M5（可选） | 拼写模式、例句、FSRS 参数个性化优化、按标签筛词 | 待定 |

## 10. 已拍板的决定

1. 词库格式：备忘录里一行一个单词（无释义），导入时从 ECDICT 补全。
2. 多设备同步：方案 B，Cloudflare Workers + D1，单用户口令鉴权。
3. 部署：仓库公开，GitHub Pages。
4. 目标考试：英语六级，首页引导优先添加「六级 CET-6」。
5. 仓库名：`lexiglass`。

## 11. 与原计划的差异

- 原计划写了「例句」：ECDICT 不含例句，v1 不做，放进 M5。
- 调度器用 ts-fsrs 6 的 FSRS-7 模型；关闭了 allowModelOverride，新词即使答「良好」也先走 10 分钟学习步。
