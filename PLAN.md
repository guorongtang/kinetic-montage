# kinetic-montage · 方案 v0.1

> 状态：已按本方案实现，实际结构与命令见 `README.md` / `SKILL.md`。
> 本文保留为设计记录。

> 目标：让任何能跑 shell 的 agent，用一条命令把「脚本 + 素材 + 旁白」变成 v13 那种
> fast-cut 动态字卡片。不是通用剪辑器，而是一套**可复现的风格引擎 + 决策规则**。

参考样本：`claude_like/films/02-compress2size/out/compress2size-v13.mp4`
（43 个镜头 / 30s / 1920×1080 / 30fps / 前 22s 切 42 次 / 8s logo 收尾）

---

## 1. 交付形态（推荐）

两层，缺一不可：

| 层 | 作用 | 为什么 |
|---|---|---|
| `kinetic` CLI | 确定性渲染、混音、校验、QA | 纯提示词保证不了帧、响度、可重跑 |
| `SKILL.md` | 告诉 agent 何时用、怎么拆脚本、怎么排切点、怎么验收 | 换任何 agent 都能按同一套流程走 |

**不做成纯 MCP**：渲染是几十秒级的本地长任务，还要读写项目文件，CLI 更稳；
以后要 MCP，包一层 `kinetic build` 即可。

**不做成纯模板**（复制一份 HTML 改代码）：v13 那种改法只能人肉维护，
agent 每次都会改出不同结构，无法回归。模板只作为 `--eject` 的逃生口保留。

---

## 2. 架构

```
film.md / script.md          ← 人 + agent 的创作层
        │
        ▼
timeline.json  ──check──▶  规则门禁
        │
        ├──render──▶ work/frames/*.png ─┐
        │                               ├──encode──▶ out/*.mp4
        └──mix────▶ out/master.wav ─────┘
                        │
                        ▼
                     out/qa.md + contact-sheet.png
```

- 渲染：Playwright + Chromium + Canvas 2D（和 v13 同一条路，像素可控）
- 音频：ffmpeg filter graph（cue sheet 驱动）
- 全部随机数改成 seeded PRNG，`draw(t)` 纯函数，任意帧可单独重跑

---

## 3. 生成出来的片子长这样

```
my-film/
├─ film.md              # 受众 / 主张 / CTA / 约束（先写这个）
├─ script.md            # 旁白脚本，5–8 句
├─ timeline.json        # 唯一事实源：镜头 + 音频 cue
├─ assets/
│  ├─ stills/           # 产品截图（真图，1080p 起）
│  ├─ fixtures/         # 示例照片（可选）
│  ├─ audio/vo.mp3
│  ├─ audio/vo.words.json
│  ├─ audio/music.wav
│  └─ sfx/              # boom / whoosh / tick / drop
├─ work/                # 帧序列、缓存（可删可重建）
└─ out/                 # mp4 + master.wav + qa.md + contact-sheet.png
```

---

## 4. timeline.json（核心接口）

```json
{
  "meta": { "preset": "v13", "width": 1920, "height": 1080, "fps": 30, "duration": 30 },
  "audio": {
    "mode": "master",
    "master": { "src": "assets/audio/master.wav", "encode": "aac" },
    "vo":    { "src": "assets/audio/vo.mp3", "at": 0.20, "words": "assets/audio/vo.words.json" },
    "music": { "src": "assets/audio/music.wav", "in": 120, "len": 30, "gain": -19 },
    "sfx": [
      { "src": "sfx/boom.mp3", "at": 3.74, "peak": -9, "trim": 0.9, "pitch": 1.1 },
      { "src": "sfx/whoosh.mp3", "at": 5.44, "peak": -16, "trim": 0.4, "pitch": 1.0 }
    ],
    "loudness": { "I": -14, "TP": -1, "LRA": 11 }
  },
  "shots": [
    { "t": 0.00, "type": "number", "value": "9.76", "unit": "MB",
      "bg": "ink", "fg": "cream", "kicker": "你这张照片" },

    { "t": 0.52, "type": "word", "lines": ["超了"], "bg": "red", "fg": "cream", "size": 300 },

    { "t": 2.52, "type": "image", "src": "fixtures/food.jpg", "mode": "cover",
      "bg": "cream", "caption": "9.76 MB" },

    { "t": 5.86, "type": "image", "src": "stills/01-empty.png", "mode": "shot",
      "bg": "ink", "caption": "不是滑块，是键盘" },

    { "t": 22.10, "type": "endcard", "brand": "compress2size",
      "tagline": "压到你要的那个数", "url": "compress2size.com",
      "cta": "免费 · 打开就能用" }
  ],
  "rules": { "cutLead": 0.30, "shard": true, "maxShot": 0.80 }
}
```

设计原则：

1. **90% 的改动只动 `timeline.json`**，不用碰渲染代码。
2. 四种镜头类型够用：`number` / `word` / `image` / `endcard`。
3. `t` 是绝对秒数；镜头持续时间由下一条决定，避免两处写时间对不上。
4. 颜色用 token（`ink/cream/blue/red`），主题可换；也允许直接写 hex。
5. `audio.mode` 两档：
   - `master`：只吃一条混好的音轨（v13 就是这档，`-c:a copy` 也能过）
   - `build`：按 cue sheet 现场混（音乐 + VO + SFX + loudnorm）

---

## 5. v13 preset：把「感觉」变成常数

`presets/v13.json` 锁死这些值（QA 会按它打分）：

| 维度 | 值 |
|---|---|
| 底色 | `#0B0B0D` `#F3F0E8` `#2F5BFF` `#FF3B1F`，文字 `#14161A` / 米白 |
| 数字 | 560px（带单位 420px），condensed 900，字距 −3%，单位 0.3× |
| 中文 | 190–300px，900，字距 −3.5%，行高 1.06 |
| 小标 | 42px，左上 (110,150) |
| 字幕 | 54px，左下 (110, H−120) |
| 左边距 | 110px |
| 入场 | ≤0.42s；word 逐行 mask wipe，行间错 0.18 |
| 数字粒子 | 7px 网格采样，6.4px 方块；前 12% 飞入，后 30% 炸开 |
| 图片 | 1.04→1.10 推近；`shot` 模式 = 模糊暗底 + 卡片 + 底部渐变压暗 |
| 切点 | 非 number 镜头前 2 帧走 shard：12×7 碎片 ±160/120px + 5 条 glitch bar |
| 节奏 | 每镜 0.45–0.75s；前 22s 切 42 次；logo 卡占 15–25% |
| 音频 | 画面比旁白早 0.25–0.5s；音乐 −19dB；loudnorm −14 LUFS |

**风格指纹**（`kinetic qa --compare v13` 用）：

```json
{ "cutsPer10s": 19, "avgShot": 0.52, "typeMix": { "word": 19, "number": 14, "image": 9 },
  "endcardRatio": 0.26, "staticRatio": 0.46, "meanFrameDiff": 6.65 }
```

> 注：v13 的 `post()` 把颗粒画到了隐藏 buffer 上，成片其实**没有颗粒**。
> 新引擎默认 `grain: 0` 以对齐 v13；想要颗粒就显式打开（修好的版本）。

---

## 6. Agent 工作流（SKILL.md 会写成 8 步）

1. `kinetic doctor` —— 查 node / ffmpeg / chromium / 字体
2. `kinetic init my-film --preset v13` —— 生成骨架
3. 写 `film.md`：一句话主张、3 个卖点、1 个 CTA、时长
4. 写 `script.md`：5–8 句，每句一个 beat；数字必须是真数字
5. 拿 VO + 词级时间戳（任意 TTS / 人声 / 现成音频）
6. `kinetic draft my-film` —— 按词首自动生成初版 `timeline.json`
7. 人来改 `timeline.json`（换词、换图、调节奏）→ `kinetic check`
8. `kinetic build && kinetic qa` —— 出片 + 报告

分支规则（SKILL.md 里明确写）：

- 用户只给 URL / 产品 → 先截 6–8 张真图、抄真实数字，再写脚本
- 用户只给主题 → 先写脚本 + TTS，再排 timeline
- 没有 VO → 允许 `music-only`，但节奏必须手工指定，QA 会警告
- 素材不足 → 用 `word/number` 撑，不允许拿假截图

---

## 7. CLI

| 命令 | 作用 |
|---|---|
| `kinetic doctor` | 环境自检，打印缺什么、怎么装 |
| `kinetic init <dir>` | 生成项目骨架 + 默认 timeline |
| `kinetic draft <dir>` | 从 `vo.words.json` 生成初版镜头表 |
| `kinetic check <dir>` | schema + 素材 + 节奏 lint（不渲染） |
| `kinetic still <dir> --t 3.2` | 单帧预览 |
| `kinetic sheet <dir>` | 每个镜头中点的接触表 |
| `kinetic preview <dir>` | 本地播放器，可拖时间轴 |
| `kinetic render <dir>` | 只出帧（支持 `--from/--to`） |
| `kinetic mix <dir>` | 只混音 |
| `kinetic build <dir>` | render + mix + encode |
| `kinetic qa <dir>` | 技术 + 风格报告 |
| `kinetic eject <dir>` | 把引擎源码倒进项目，允许硬改 |

---

## 8. QA 门禁（agent 必须过）

1. 时长 / 帧数 / fps 精确（30.000s / 900 帧）
2. 响度 −14 ± 1 LUFS，TP ≤ −1 dBFS
3. 除 endcard 外，无 >1.2s 静止段
4. 每行 ≤ 6 个汉字、≤ 2 行；数字 ≤ 5 字符
5. 切点与 VO 词首偏差 ≤ 0.6s（提供 words 时）
6. 素材存在且 ≥ 1080p；字体覆盖所有字符（无 tofu）
7. 确定性：随机 3 帧重渲，PSNR > 80
8. 风格指纹与 v13 的偏差在阈值内
9. 输出 `out/qa.md` + `out/contact-sheet.png` 供人一眼验收

---

## 9. 可移植性（“任何 agent”）

- **字体是最大坑**：v13 依赖 macOS 的 Avenir Next Condensed + PingFang SC。
  skill 内置 OFL 字体（Archivo Condensed / Noto Sans SC），
  先检测系统字体，没有就用内置，保证 Linux / Windows 也不漂。
- 依赖只有 node ≥ 20、ffmpeg ≥ 6、Playwright Chromium（约 120MB）。
  `doctor` 负责给安装命令；`--channel chrome` 可复用系统 Chrome。
- 不使用绝对路径；所有路径相对项目根或 `import.meta.dirname`。
- 渲染不联网；TTS 是可插拔 provider，不是必需。
- 目录可直接丢进 `~/.agents/skills/` / `.claude/skills/` / 项目内 `skills/`。

---

## 10. 这个 skill 仓库的结构

```
kinetic-montage/
├─ SKILL.md                  # <500 行，只放决策与流程
├─ README.md                 # 人看的 quickstart
├─ package.json
├─ bin/kinetic.mjs
├─ engine/
│  ├─ index.html
│  ├─ engine.js              # draw(t) 调度
│  ├─ renderers/{number,word,image,endcard}.js
│  ├─ transitions/{shard,cut}.js
│  ├─ prng.js
│  └─ theme.js
├─ schema/timeline.schema.json
├─ presets/v13.json
├─ scripts/{doctor,init,draft,check,render,mix,build,qa,sheet,preview,eject}.mjs
├─ providers/{tts-none,tts-listenthub}.mjs
├─ templates/project/{film.md,script.md,timeline.json,qa.md}
├─ examples/
│  ├─ 12s-min/               # 无旁白最小例
│  └─ v13-regression/        # 只放 timeline + 12 张参考帧（不放原素材）
└─ docs/{style-spec.md,audio.md,troubleshooting.md}
```

---

## 11. 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| M0 | 引擎从 compose8 抽出、参数化、内置字体 | 12 个时间点渲染与 v13 参考帧 PSNR > 45 |
| M1 | CLI：init / check / render / build / qa | 一条命令从 0 出 30s mp4 |
| M2 | 音频 build 模式 + draft（词级对齐） | 换一条新 VO，切点自动落在词首前 0.3s |
| M3 | SKILL.md + 模板 + 文档 | 新 agent 只看 skill 能独立跑通 |
| M4 | 例子 + 跨平台（无 mac 字体）+ 打包 | Linux 容器里同一 timeline 布局不漂 |

回归金标准：给定 v13 的 timeline 和素材，900 帧 PSNR > 45（目标 > 50），
音频响度/时长/帧数全过；同一帧跑两次 PSNR > 80。

---

## 12. 风险

| 风险 | 处理 |
|---|---|
| Chromium 装不上 | `--channel chrome` / 输出 HTML 预览 + 手动录屏降级 |
| 字体跨平台漂移 | 内置字体 + 固定 font-feature + golden test |
| 中文字距/断行差异 | 逐行手写 `lines`，不让浏览器自动断行 |
| 音频 AAC priming 偏移 | 文档写死 ~21ms，qa 检查音画偏差 |
| agent 把片子写成“PPT” | 节奏 lint + 风格指纹 + 强制 0.45–0.75s |
| 素材版权 | 示例只用自制/CC0；skill 不打包 compress2size 原素材 |

---

## 13. 需要拍板

1. 形态：CLI + Skill（推荐）/ 纯 Skill / MCP
2. 引擎：Playwright Chromium（推荐）/ 纯 Node canvas / HyperFrames
3. 音频：master + build 两档（推荐）/ 只 master / 再加 TTS
4. 风格：先锁死 v13 preset（推荐）/ 一开始就做多主题
5. 范围：30s 16:9（推荐）/ 同时上 9:16
6. 回归样例：内置 v13 的 timeline + 参考帧（推荐，不含原素材）/ 不做
