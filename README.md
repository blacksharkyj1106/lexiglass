# LexiGlass 背单词

iOS 风格的背单词网页 App（PWA），适配 iPhone / iPad / Mac，添加到主屏幕后像原生 App 一样全屏运行、可离线使用。

- **记忆曲线**：FSRS-7 算法（Anki 同款思路的新一代版本）调度复习，按「你还有多大把握记得」来安排下次出现的时间
- **单词朗读**：在线真人发音 + 系统语音离线兜底，美音 / 英音、语速可调
- **内置词书**：六级、六级新增、四级、考研、雅思、托福、GRE、高考（数据来自 ECDICT）
- **导入自己的词库**：直接从备忘录粘贴，一行一个词；自动补全音标释义、复数等变形还原原形、拼错的词给出建议
- **多设备同步**：可选，自建在 Cloudflare 免费额度上
- **iOS 质感**：系统字体和颜色、大标题导航、悬浮玻璃 Tab Bar、Sheet、弹簧动画、深色模式、触感反馈

## 在设备上使用

部署好后打开 `https://<你的用户名>.github.io/lexiglass/`：

| 设备 | 安装方式 |
|---|---|
| iPhone / iPad | Safari 打开 → 分享按钮 → **添加到主屏幕** |
| Mac | Safari 打开 → 菜单「文件」→ **添加到程序坞**（macOS Sonoma 及以上） |

**一定要添加到主屏幕再用。** 直接在 Safari 标签页里用的话，7 天不打开 Safari 可能清掉本地数据。

### 学习页快捷操作

| 操作 | 触屏 | 键盘（Mac / iPad 妙控键盘） |
|---|---|---|
| 显示答案 | 点卡片 | 空格 |
| 评分 重来 / 困难 / 良好 / 简单 | 底部按钮；左滑 = 重来，右滑 = 良好 | 1 / 2 / 3 / 4（空格 = 良好） |
| 重读 | 点音标 | R |
| 撤销上一次评分 | 右上角按钮 | ⌘Z |
| 斩（已认识，不再出现） | 卡片右上角剪刀 | — |
| 切换页面 | 底部 Tab | ⌘1–4 |

## 部署网页（GitHub Pages）

1. 仓库 **Settings → General → Danger Zone → Change visibility** 改为 Public（免费版 GitHub Pages 只支持公开仓库）
2. **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**
3. 推送到 `main` 分支，Actions 里的 *Deploy to GitHub Pages* 会自动构建发布

## 同步服务（可选）

不配置同步也能用，只是每台设备的进度各自独立（可以用「设置 → 数据 → 导出备份 / 从备份恢复」手动搬）。

配置一次后，iPhone / iPad / Mac 填同一个地址和口令即可自动同步。全部在手机上也能完成：

1. 注册 [Cloudflare](https://dash.cloudflare.com/)（免费）
2. 左侧 **Storage & Databases → D1 → Create database**，名称填 `lexiglass`，创建后复制 **Database ID**
3. 右上角头像 **My Profile → API Tokens → Create Token**，选模板 **Edit Cloudflare Workers**，权限里再加一条 **Account → D1 → Edit**，创建后复制 Token
4. 在 Cloudflare 首页右侧复制 **Account ID**
5. 自己想一个足够长的随机口令（例如 32 位随机字符串），作为同步口令
6. GitHub 仓库 **Settings → Secrets and variables → Actions → New repository secret**，添加四个：

   | 名称 | 值 |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | 第 3 步的 Token |
   | `CLOUDFLARE_ACCOUNT_ID` | 第 4 步的 Account ID |
   | `D1_DATABASE_ID` | 第 2 步的 Database ID |
   | `SYNC_TOKEN` | 第 5 步的口令 |

7. 仓库 **Actions → Deploy sync worker → Run workflow**。跑完后在日志的 Deploy 步骤里找到 `https://lexiglass-sync.<你的子域>.workers.dev`
8. 每台设备的 App 里：**设置 → 多设备同步**，填服务地址和口令，点「测试并保存」

同步规则：每条记录（单词进度、复习日志、词书、设置）带修改时间，冲突时保留较新的。启动、切回前台、有新的学习记录后、以及每 5 分钟会自动同步。

## 开发

```bash
npm install
npm run dev          # 本地开发
npm test             # 同步服务的单元测试
npm run build        # 类型检查 + 构建到 dist/
npm run dict -- path/to/ecdict.csv   # 重新生成 public/data 下的词书与查词表
npm run icons        # 用 Playwright 从 public/icons/icon.svg 渲染 PNG 图标
```

目录结构：

```
src/lib/        数据层（Dexie/IndexedDB）、FSRS 调度、学习队列、朗读、导入、同步
src/pages/      今日 / 学习 / 词书 / 统计 / 设置
src/components/ iOS 风格组件（导航栏、列表、开关、分段控件、Sheet……）
worker/         同步服务（Cloudflare Worker + D1）
scripts/        词典与图标构建脚本
public/data/    预生成的词书和导入查词表
docs/PLAN.md    设计与实施计划
```

## 已知限制

- **玻璃效果**只做到毛玻璃 + 高光，做不到 iOS 26 液态玻璃的折射：那需要 SVG 滤镜作用于 `backdrop-filter`，Safari 不支持
- **没有例句**：ECDICT 不含例句，后续可以考虑接入其他开源例句库
- **在线真人发音**用的是有道的公开发音地址，非官方接口，失效时自动回退到系统语音
- iOS 上网页没有震动 API，触感反馈借用了 iOS 18 开关控件的系统触感，属于非官方技巧

## 致谢

- 词典数据：[ECDICT](https://github.com/skywind3000/ECDICT)（MIT，见 `public/data/LICENSE-ECDICT.txt`）
- 记忆算法：[ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)
