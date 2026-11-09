# 故障处理

## 环境

**`doctor` 报 chromium 缺失**

```bash
npx playwright install chromium
```

装不了（公司网络/代理）就用系统 Chrome：

```bash
node bin/kinetic.mjs build . --channel chrome
```

**ffmpeg 缺失**

```bash
brew install ffmpeg        # macOS
sudo apt install ffmpeg    # Debian/Ubuntu
```

**中文变方块 / 豆腐字**

内置字体在 `engine/fonts/`（Archivo Narrow + Noto Sans SC）。
如果被删了，重新下载或改 `presets/v13.json` 的 `theme.fonts.cjk` 为系统已有字体：

```bash
fc-list :lang=zh | head    # Linux 查看可用中文字体
```

**数字字体不像 v13**

macOS 用 Avenir Next Condensed；其他平台回退 Archivo Narrow。
两者字宽不同，切换平台后重新跑 `kinetic sheet` 检查排版。

---

## 时间轴

**`timeline.json not found`**

命令要指向**项目目录**（包含 timeline.json），不是 skill 目录。

**`shots[i].t: not ascending`**

`t` 必须严格递增。`draft` 生成的草稿偶尔会在改词后乱序，手动修。

**`shots[i].src missing`**

图片路径相对 `assets/`：

```json
{ "src": "stills/01-empty.png" }   →  assets/stills/01-empty.png
```

大小写敏感；不要写 `assets/` 前缀。

**`audio.master missing`**

`master.src` 也相对 `assets/`。没有音轨就先删掉 `audio` 段，或用 `mode: "build"`。

**endcard 报 `-0.8s` / 时长为负**

最后一个镜头的时间超过了 endcard。把 endcard 的 `t` 往后挪，或缩短前一个镜头。
`draft` 已自动处理，手写时注意。

---

## 渲染

**画面全黑 / 只有背景色**

- 该时间点落在两个镜头之间？`t` 必须覆盖 0 → duration。
- 图片没加载：看 build 输出的 `missing assets`。
- `draw(t)` 的 `t` 超出 duration：最后一帧用 `duration - 0.001`。

**数字只剩单位 / 数字不见了**

正常现象：数字镜头最后 30% 会炸开。看分镜用 `kinetic sheet`（采样在镜头前段），
不要用任意时间点截图判断。

**渲染很慢**

900 帧约 36–40 秒。不要同时跑多个 build；Chromium 会抢 CPU。

**帧数不对**

检查 `meta.duration × fps`；`-shortest` 只在 `master + copy` 时用，
`build` 用 `-t duration`，避免 AAC 尾巴吃掉最后一帧。

---

## 预览

**端口被占**

```bash
node bin/kinetic.mjs preview . --port 4180
```

**白屏**

打开控制台看 404：通常是 `assets/` 路径不对，或 `timeline.json` 有 schema 错误。
先跑 `kinetic check .`。

---

## QA

**loudness 不在 −14 ±1.5**

- `master`：换一条 −14 LUFS 的音轨（`ffmpeg -af loudnorm` 预处理好）。
- `build`：检查 `audio.loudness`，或降低音乐/SFX 峰值。

**true peak > −1**

`loudness.TP` 设为 −1；SFX 峰值整体降 1–2 dB。

**static gaps**

某个镜头超过 1.2 秒没变化。拆镜头、缩短 hold，或给数字镜头加后半段运动。
结尾卡不算（按 `endcard.t` 之后排除）。

**reference PSNR 低**

只有 `examples/v13-regression` 有意义。QA 会优先比较 `work/frames`（无损），
如果 frames 不存在才比较成片（有 H.264 损失，阈值应放宽）。

**cuts / 10s 偏差大**

镜头密度不对。v13 是 19 次/10 秒；少于 12 就拆镜头，不要靠加速播放。

---

## 音频

**成片没有声音**

`build` 模式没有提供任何音源时会生成静音轨，QA 会失败。加 `music` 或 `vo`。

**旁白比画面晚**

把 `vo.at` 提前，或把切点整体提前 0.2–0.3 秒。AAC 还有约 21ms priming。

**音效听不见**

`peak` 太低，或 `trim` 把瞬态切掉了。boom 用 −8，whoosh 用 −14。

**音乐结尾突然断**

设 `music.fadeOutAt = duration - 1.2`、`fadeOut: 1`。

---

## 其他

**`--engine .` 不生效**

`eject` 后确认项目里有 `engine/index.html`；`--engine` 指向的是包含 `index.html` 的目录。

**改了 preset 但画面没变**

`timeline.json` 里的 `theme` / `motion` 会覆盖 preset。删掉局部覆盖再试。

**想加新镜头类型**

改 `engine/cards.js` + `engine/engine.js` 的 dispatch，再 `eject` 或直接改 skill 内的引擎。
新增类型记得同步 `schema/timeline.schema.json` 和 `lib/spec.mjs` 的 `TYPES`。
