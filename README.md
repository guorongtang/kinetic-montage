# kinetic-montage

给 agent 用的「快切字卡」短视频生成器：写一张“第几秒出现什么”的清单，一条命令渲成 15–30 秒的产品短片。

---

## 先说清楚：这是什么风格

不是“科技感”“高级感”这种没法执行的形容词，而是下面这套很具体的画面：

- **底色只有四种**：近黑、米白、亮红、电光蓝。一屏一个颜色，整块铺满。
- **大多数镜头 0.3–0.9 秒，硬切**；截图可以停到 1.4 秒。没有淡入淡出，也没有缓慢推拉镜头。
- **画面主角是巨大的数字或短句**：`9.76 MB`、`0.52 秒`、`100%`，或者“超了”“点一下”“不用装”。
- **数字由小方块粒子拼成**：先飞进来，镜头快结束时再炸开。
- **每隔 3–4 个镜头插一张真实产品截图**；截图后面是同一张图的模糊暗底。
- **非数字镜头出现前约 2 帧**，画面会碎成 12×7 块，并闪几条横向 glitch。
- **最后 4–8 秒只放品牌**：logo、一句 tagline、网址、一个 CTA 按钮。

参考片是 30 秒 43 个镜头，平均 0.52 秒切一次，前 22 秒讲完故事，最后 8 秒收品牌。

> “v13”只是我们内部给这条参考片起的代号，不是行业术语。仓库里的 `v13 preset` 就是上面这套风格的参数包。你不需要知道 v13 是什么，按这份 README 用就行。

---

## 它适合 / 不适合

**适合：**

- 15–30 秒的产品发布、功能揭晓、SaaS / 工具宣传
- 需要强节奏、数字冲击力、字幕感的活动预告
- 已经有真实截图和真实数字，想让 agent 直接出片

**不适合：**

- 真人实拍、访谈、vlog、长叙事
- 复杂 3D、粒子特效大片、逐字歌词 MV
- 竖屏 9:16（目前只支持 16:9 横屏）
- 想手工拖时间线剪片——这里没有剪辑软件那种时间线 GUI

---

## 什么网站适合做这个片子

只要网站/产品有**一个真实、可达的动作**，并且至少有一张**能截到的真实页面**，就适合。

动作包括：注册、开始使用、购买、预约、报名、下载、投递、申请、订阅、联系、加入 waitlist、预约 demo、关注、分享。
不要求全站只有一个动作；为这条片子选一个主行动即可。不按“内容站/品牌站/社区/企业首页/waitlist”等类型排除。

截图少于 4 张也能做，只是成片会多用字卡；4–8 张是制作准备度，不是适合性门槛。

制作前先判断：

```bash
cp templates/fit.json fit.json
# 把截图放进 fit/，填 target / action / interface / evidence
node bin/kinetic.mjs fit fit.json
```

- `FIT` → `node bin/kinetic.mjs init my-film --fit fit.json`
- `HOLD`（`needs_evidence`）→ 补 demo/账号/截图，再跑
- `NOT FIT` → 停止，换形式

细节见 `docs/fit-check.md`。

---

## 一条片子由什么组成

`timeline.json` 是唯一需要改的文件。它是一张表，每一行是一个镜头，写着“从第几秒开始、屏幕上出现什么”。

只有四种镜头：

| 类型 | 作用 | 例子 |
|---|---|---|
| `number` | 数字当主角 | `9.76 MB`、`0.52 秒`、`100%` |
| `word` | 2–6 个字的短句 | “超了”“点一下”“不用装” |
| `image` | 真实产品截图 | 后台、界面、结果页 |
| `endcard` | 最后收品牌 | logo + 一句话 + 网址 + CTA |

```json
{
  "meta": { "title": "我的产品", "preset": "v13", "width": 1920, "height": 1080, "fps": 30, "duration": 20 },
  "audio": { "mode": "build", "music": { "src": "audio/music.m4a", "gain": -19 } },
  "shots": [
    { "t": 0.00, "type": "number", "value": "9.76", "unit": "MB",
      "bg": "ink", "fg": "cream", "kicker": "你这张照片" },

    { "t": 0.52, "type": "word", "lines": ["超了"],
      "bg": "red", "fg": "cream", "size": 300 },

    { "t": 2.52, "type": "image", "src": "stills/01.png",
      "mode": "shot", "bg": "cream", "caption": "不是滑块，是键盘" },

    { "t": 16.00, "type": "endcard", "brand": "我的产品",
      "tagline": "一句话说清价值", "url": "example.com",
      "cta": "免费 · 打开就能用" }
  ]
}
```

`t` 是绝对秒数；这个镜头持续多久，由下一条的 `t` 决定。第一个镜头从 0 开始。

颜色可以直接写 `ink` / `cream` / `red` / `blue` / `text`，也可以写 hex。图片路径相对于项目的 `assets/` 目录。

---

## 它怎么工作

```text
film.md / script.md          ← 你先写清楚卖点和旁白
        │
        ▼
timeline.json  ──check──▶  检查素材、节奏、文案长度
        │
        ├──render──▶ work/frames/*.png ─┐
        │                               ├──encode──▶ out/*.mp4
        └──mix────▶ out/master.wav ─────┘
                        │
                        ▼
                  out/qa.md + contact-sheet.png
```

关键点：**随机数全部固定，`draw(t)` 是纯函数**。同一份 `timeline.json` 跑两次，帧和 mp4 都完全一样；不是“差不多”，是逐字节相同。

---

## 快速开始

```bash
# 依赖（只需一次）
npm install
npx playwright install chromium
node bin/kinetic.mjs doctor

# 新建项目（网站/产品建议先过 fit，见 docs/fit-check.md）
node bin/kinetic.mjs init my-film --title "我的产品" --duration 20
# 或者：node bin/kinetic.mjs init my-film --fit fit.json --title "我的产品" --duration 20
cd my-film

# 改 timeline.json、把截图放进 assets/stills/、把音乐放进 assets/audio/
# 然后回到 skill 目录执行：
node ../bin/kinetic.mjs check .
node ../bin/kinetic.mjs sheet .          # 先看每个镜头长什么样
node ../bin/kinetic.mjs build . --name my-film
```

产物：

```text
out/my-film.mp4
out/qa.md                 # 时长、帧数、响度、静止段、风格指纹
out/contact-sheet.png     # 每秒一张，快速扫一遍
```

也可以直接跑自带的例子：

```bash
node bin/kinetic.mjs build examples/12s-min --name 12s-min
open examples/12s-min/out/12s-min.mp4
```

---

## 已验证

| 测试 | 结果 |
|---|---|
| v13 回归：900 帧逐张对比 | **900/900 md5 相同** |
| v13 回归：成片对比 | **md5 相同**（`49c19e0e0236d74d39b3d6de8c26c6eb`，7,050,438 字节） |
| 渲染速度 | 900 帧约 36–38 秒（M4 Pro，单 Chromium） |
| 12 秒最小样例 | 360 帧，渲染约 8 秒；QA PASS |
| 确定性 | 同一 `t` 跑两次，字节一致 |

回归命令：

```bash
npm test          # 12 个参考帧的 PSNR
npm run test:fit  # 适配判断的单元测试
npm run regress   # 重建整片，要求 md5 完全一致
```

回归样例在 `examples/v13-regression/`：自带 43 镜 timeline、12 张参考帧和原音轨。

---

## 命令

| 命令 | 作用 |
|---|---|
| `doctor` | 检查 node / ffmpeg / Chromium / 字体 |
| `fit <fit.json>` | 制作前判断网站/产品适不适合；输出 FIT / HOLD / NOT FIT |
| `init <dir>` | 生成一个能跑的 project 骨架；`--fit fit.json` 或 `--topic "..."` |
| `check <dir>` | 检查 schema、素材、文案长度和节奏，不渲染 |
| `draft <dir> --words <json>` | 按旁白的词级时间戳，自动生成初版镜头表 |
| `still <dir> --t 3.2` | 只渲染某一秒，看看这一帧 |
| `sheet <dir>` | 每个镜头截一张，拼成 `out/sheet.png` 分镜图 |
| `preview <dir>` | 本地播放器，可以拖时间轴（`http://127.0.0.1:4173`） |
| `render <dir>` | 只出帧 → `work/frames/` |
| `mix <dir>` | 只混音 → `out/master.wav` |
| `build <dir>` | 渲染 + 混音 + 编码 + QA，一条命令出片；`--require-fit` 强制先过适配判断 |
| `qa <dir> --video <mp4>` | 单独跑技术 + 风格报告 |
| `eject <dir>` | 把引擎源码复制进项目，之后允许硬改渲染代码 |

---

## 目录

```text
kinetic-montage/
├─ SKILL.md                 # agent 读这个：什么时候用、怎么拆脚本、怎么验收
├─ bin/kinetic.mjs          # CLI
├─ lib/                     # spec / render / audio / encode / qa / draft / preview / fit
├─ engine/                  # Canvas 渲染器（core / cards / engine + 内置字体）
├─ presets/v13.json         # 这套风格的全部常数
├─ schema/timeline.schema.json
├─ schema/fit.schema.json    # 制作前适配记录
├─ templates/project/       # film.md / script.md / timeline.json
├─ templates/fit.json       # fit.json 模板
├─ docs/                    # style-spec / fit-check / audio / troubleshooting
├─ examples/
│  ├─ v13-regression/       # 与参考片逐字节一致的回归
│  └─ 12s-min/              # 12 秒最小样例
├─ runs/kinetic-promo/      # 20 秒演示片的时间轴和素材
└─ tools/                   # 开发用：提取参考时间轴、逐帧比对
```

---

## 设计原则

1. **风格是数据**：颜色、字号、入场时长、碎片窗口、节奏全部在 `presets/v13.json`，改风格不用改渲染代码。
2. **渲染是纯函数**：`draw(t)` 只依赖 `t` 和 `timeline.json`；随机数用 seeded hash。
3. **QA 是门禁**：时长 / 帧数 / 响度 / 静止段 / 风格指纹不过，不算交付。
4. **逃生口**：`eject` 把引擎复制进项目，之后可以用 `--engine .` 跑改过的版本。
5. **适配是旁路**：`fit.json` 不进入 `timeline.json`，不参与 `draw(t)`，不影响帧和 mp4。

---

## 依赖

- node ≥ 20
- ffmpeg ≥ 6（`brew install ffmpeg` / `apt install ffmpeg`）
- Playwright Chromium（约 120MB，`npx playwright install chromium`）
- 字体：macOS 用 Avenir Next Condensed + PingFang SC；其他平台自动用内置的
  Archivo Narrow + Noto Sans SC（OFL，随包）

---

## 边界

- 只支持 1920×1080 / 30fps（引擎按 30fps 计算帧号）
- 转场只有硬切 + 2 帧碎片；没有叠化、推拉、3D
- 音频 AAC 编码有约 21ms priming 偏移；旁白对齐按 0.3s 提前量吸收
- `examples/` 里的截图和音轨来自参考项目，**仅本地回归用**；对外分发前请删除或替换
- 字体许可：Archivo Narrow、Noto Sans SC 均为 SIL OFL；见 `engine/fonts/`
