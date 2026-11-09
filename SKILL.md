---
name: kinetic-montage
description: 生成 v13 风格的快切动态字卡视频（fast-cut kinetic typography promo）：15–30 秒产品演示、发布预告、功能揭晓、text-card montage，硬切、巨型数字、真实截图、碎片转场、logo 收尾。用户说「v13 风格」「动态字卡」「快切演示片」「30 秒产品片」「kinetic montage」时使用。
---

# kinetic-montage

把「脚本 + 真素材 + 旁白」变成一条 v13 那种 30 秒快切字卡片：
43 个镜头、平均 0.5 秒一切、巨型数字、真实截图、碎片转场、8 秒 logo 收尾。

工具是确定性的：同一份 `timeline.json` 跑两次，帧和 mp4 都完全一致。

---

## 0. 先决条件

```bash
cd <skill-dir>
npm install
npx playwright install chromium   # 只需一次
export K="node $(pwd)/bin/kinetic.mjs"
$K doctor                         # 必须全绿
```

`doctor` 检查 node ≥20、ffmpeg、Chromium、内置字体。
没装 ffmpeg：`brew install ffmpeg`（macOS）或 `apt install ffmpeg`（Linux）。

> 如果每条命令都在新的 shell 里跑，`$K` 不会保留；把它换成
> `node <skill-dir>/bin/kinetic.mjs` 即可。

---

## 1. 什么时候用 / 不用

**用**：15–30 秒、以文案和数字为主、需要“快、狠、准”的产品演示 / 发布片 / 功能揭晓。
**不用**：需要真实人物、实拍、长叙事、复杂转场、3D、逐字歌词 —— 换别的工具。

一条片子的信息结构只有：**一个问题 → 一个反转 → 一个演示 → 一个收尾**。

---

## 2. 八步流程

### ① 建项目

```bash
$K init my-film --title "产品名" --duration 30
cd my-film
```

生成 `timeline.json`（可跑的 14 秒示例）、`film.md`、`script.md`、`assets/`。

### ② 写 `film.md`（5 分钟，必须写）

一句话主张、受众、三个真证据（真数字 / 真截图）、CTA、时长。
**证据不真，整条片子就是假的**——不要编数字。

### ③ 写 `script.md`

5–8 句，每句一个 beat。例：

```
你这张照片 9.76 兆，要求 100K，差 97 倍。
现在反过来：你给它一个数。
三张一起拖进去，点一下，100、99、99。
改成 60，它就给你 60。
不用装，不上传，不用注册。
压到你要的那个数。
```

数字用阿拉伯数字；一句话里最多两个数字。

### ④ 拿旁白 + 词级时间戳

任意 TTS / 人声 / 现成音频都可以。需要一份词级 JSON（毫秒）：

```json
{ "sentences": [ { "words": [ { "startMs": 200, "endMs": 560, "text": "你这张", "punctuation": "" } ] } ] }
```

支持三种格式：`sentences[].words[]`、`words[]`、扁平数组。
没有时间戳就先手工写 `timeline.json`，不要硬猜。

### ⑤ 生成初版时间轴

```bash
$K draft . --words assets/audio/vo.words.json
```

输出 `timeline.draft.json`：按词首自动切镜，画面比旁白早 0.3s，自动配色。
**这是草稿，不是成片**：你要手动换图、改词、调节奏，再存成 `timeline.json`。

### ⑥ 改 `timeline.json`

只改数据，不改代码。四种镜头：

| type | 用途 | 关键字段 |
|---|---|---|
| `number` | 数字当主角 | `value` `unit` `kicker` `bg` `fg` |
| `word` | 2–6 个字的主张 | `lines` `size` `stamp` |
| `image` | 真截图 | `src` `mode`(`shot`/`cover`) `caption` |
| `endcard` | 收尾 | `brand` `tagline` `url` `cta` |

`t` 是绝对秒数；下一条的 `t` 决定这一条多长。第一个镜头必须在 0。

### ⑦ 检查 + 看分镜

```bash
$K check .
$K sheet .          # 每个镜头一张分镜图 → out/sheet.png
$K preview .        # 本地播放器，可拖时间轴
```

`check` 的 error 必须清零；warning 要么修，要么明确知道为什么留着。

### ⑧ 出片 + 验收

```bash
$K build . --name my-film
```

产出：

- `out/my-film.mp4`
- `out/qa.md`（技术 + 风格报告）
- `out/contact-sheet.png`（每秒一张）

**QA 必须 PASS 才算交付。** 失败项看第 6 节。

---

## 3. 节奏规则（这是风格本身）

| 规则 | 值 |
|---|---|
| 每个镜头 | 0.3–0.9 秒；截图可到 1.4 秒 |
| 前 10 秒 | 至少 12 个镜头 |
| 全片 | 至少 4 镜头 / 10 秒 |
| 收尾卡 | 4–8 秒，占 15–25% |
| 每行 | ≤ 6 个汉字 |
| 每个 word 镜头 | ≤ 2 行 |
| 数字 | ≤ 5 个字符 + 单位 |
| 同色背景 | 不超过连续 2 个镜头 |
| 截图 | 每 3–4 个 beat 一张，必须配 caption |
| 旁白 | 画面比词首早 0.25–0.5 秒 |

**不要**：段落、长句、渐变转场、缓慢推拉、超过 1.5 秒的静止、假数字、假截图。
**要**：硬切、碎片、数字滚动/炸开、真实产品界面、最后 8 秒只放品牌。

---

## 4. 音频

两种模式，写在 `timeline.json`：

```json
"audio": { "mode": "master", "master": { "src": "audio/master.m4a", "encode": "copy" } }
```

```json
"audio": {
  "mode": "build",
  "vo":    { "src": "audio/vo.mp3", "at": 0.2, "peak": -2.5 },
  "music": { "src": "audio/music.wav", "in": 120, "len": 30, "gain": -19 },
  "sfx":   [ { "src": "sfx/boom.mp3", "at": 3.74, "peak": -9, "trim": 0.9, "pitch": 1.1 } ],
  "loudness": { "I": -14, "TP": -1, "LRA": 11 }
}
```

- `master`：已经混好的一条音轨。v13 用的就是这档（原样 copy AAC）。
- `build`：现场混。音乐 + 旁白 + 音效 → loudnorm −14 LUFS。

没有旁白时用 `build` + 音乐床；QA 仍会要求非静音。
细节见 `docs/audio.md`。

---

## 5. 四种镜头怎么写

```json
{ "t": 0.00, "type": "number", "value": "9.76", "unit": "MB",
  "bg": "ink", "fg": "cream", "kicker": "你这张照片" }

{ "t": 0.52, "type": "word", "lines": ["超了"], "bg": "red", "fg": "cream", "size": 300 }

{ "t": 5.86, "type": "image", "src": "stills/01-empty.png", "mode": "shot",
  "bg": "ink", "caption": "不是滑块，是键盘" }

{ "t": 22.10, "type": "endcard", "bg": "cream", "brand": "compress2size",
  "tagline": "压到你要的那个数", "url": "compress2size.com", "cta": "免费 · 打开就能用" }
```

- `bg` / `fg` 用 token：`ink` `cream` `blue` `red` `text`；也可以直接写 hex。
- `src` 相对于 `assets/`。
- `image` 的 `mode: "shot"` 会加模糊暗底 + 卡片 + 底部渐变压暗；`cover` 是满屏铺。
- `number` 的 `value` 只放数字/小数点，单位放 `unit`（`MB` `KB` `×` `秒`）。

---

## 6. QA 失败怎么修

| 失败项 | 修法 |
|---|---|
| duration / frames 不对 | 检查 `meta.duration` 与 `audio` 长度；不要手动改 fps |
| loudness 不在 −14 ±1.5 | `master` 换一条 −14 LUFS 音轨；`build` 检查 `loudness` |
| true peak > −1 | 混音里加 `loudnorm TP=-1`，或降 SFX peak |
| static gaps | 缩短 hold、给数字镜头加后半段炸开、把长镜头拆开 |
| reference PSNR 低 | 只对 `examples/v13-regression` 有意义；看 `work/frames` 而不是成片 |
| cuts / 10s 偏差大 | 镜头太少或太长；拆镜头，不要加速播放 |
| 缺素材 | 路径相对 `assets/`，大小写敏感 |

---

## 7. 故障处理

| 现象 | 处理 |
|---|---|
| `doctor` 说 chromium 缺失 | `npx playwright install chromium` |
| 公司网络装不了 Chromium | `--channel chrome` 用系统 Chrome |
| 中文变方块 | 内置 Noto Sans SC 已随包；确认 `engine/fonts/` 存在 |
| 数字字体不像 | macOS 用 Avenir Next Condensed；其他平台用 Archivo Narrow |
| 预览打不开 | 端口被占：`--port 4180`；必须从项目目录跑 |
| 渲染很慢 | 30s/900 帧约 40 秒；不要并行跑多个 build |

---

## 8. 交付清单

- [ ] `out/<name>.mp4`：1920×1080 / 30fps / 时长精确
- [ ] `out/qa.md`：PASS
- [ ] `out/contact-sheet.png`：人工扫一遍，没有空镜/错字
- [ ] `timeline.json` + `assets/`：可重跑
- [ ] 数字和截图都能在产品里找到出处
- [ ] 手机上竖屏看一遍（16:9 在手机上是缩小，字要够大）

---

## 9. 参考

- `docs/style-spec.md`：v13 的全部常数（颜色/字号/运动曲线/节奏）
- `docs/audio.md`：混音 cue sheet 与响度
- `docs/troubleshooting.md`：更多报错
- `examples/v13-regression/`：与 v13 成片逐字节一致的回归样例
- `examples/12s-min/`：12 秒、无旁白、纯字卡的最小样例
