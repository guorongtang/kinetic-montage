# 音频

两种模式：`master`（吃现成音轨）和 `build`（按 cue sheet 现场混）。

---

## master

```json
"audio": {
  "mode": "master",
  "master": { "src": "audio/master.m4a", "encode": "copy" }
}
```

- `encode: "copy"`：直接把 AAC 流拷进成片，不重编码（v13 用的就是这档）。
- `encode: "aac"`：重编成 `encode.audioBitrate`。
- 推荐先混好、响度做到 −14 LUFS，再放进来。

---

## build

```json
"audio": {
  "mode": "build",
  "vo":    { "src": "audio/vo.mp3", "at": 0.20, "peak": -2.5 },
  "music": {
    "src": "audio/music.wav", "in": 120, "len": 30, "gain": -19,
    "fadeIn": 0.4, "fadeOutAt": 29.0, "fadeOut": 1.0
  },
  "sfx": [
    { "src": "sfx/boom.mp3",   "at": 3.74, "peak": -9,  "trim": 0.9, "pitch": 1.1 },
    { "src": "sfx/whoosh.mp3", "at": 5.44, "peak": -16, "trim": 0.4, "pitch": 1.0 },
    { "src": "sfx/tick.mp3",   "at": 9.94, "peak": -12, "trim": 0.3, "pitch": 1.15 }
  ],
  "loudness": { "I": -14, "TP": -1, "LRA": 11 }
}
```

### 字段

| 字段 | 说明 |
|---|---|
| `vo.at` | 旁白进入时间（秒） |
| `vo.peak` | 旁白峰值（dB），默认 −2.5 |
| `music.in` / `len` | 从音乐第几秒开始、取多长 |
| `music.gain` | 音乐增益，v13 是 −19dB |
| `sfx[].at` | 音效落点（秒） |
| `sfx[].peak` | 音效峰值（dB） |
| `sfx[].trim` | 只取前 N 秒，自动 25ms 淡出 |
| `sfx[].pitch` | 变调不变速（`asetrate` + `atempo` 回正） |

### 处理链

每个音源：

```
aformat=48k stereo
→ silenceremove（去掉头部静音）
→ [pitch] → [trim + fadeout]
→ volume = peak − 实测 max_volume
→ adelay
→ amix normalize=0 duration=longest
→ loudnorm I=-14 TP=-1 LRA=11
→ apad
→ -t <duration>
```

SFX 建议：

| 场景 | 音效 | peak |
|---|---|---|
| 大节拍 / 换章 | `boom` | −8 ~ −9 |
| 字卡切入 | `whoosh` | −14 ~ −16 |
| 数字滚动 | `tick` | −11 ~ −12 |
| 点击 | `click` | −9 |
| 拖入 | `drop` | −9 |

---

## 旁白词级时间戳

`kinetic draft` 需要毫秒级词表。支持三种：

```json
{ "sentences": [ { "words": [ { "startMs": 240, "endMs": 560, "text": "报名", "punctuation": "" } ] } ] }
```

```json
{ "words": [ { "startMs": 240, "endMs": 560, "text": "报名" } ] }
```

```json
[ { "startMs": 240, "endMs": 560, "text": "报名" } ]
```

`draft` 的行为：

- 每 ≤5 个汉字切一个 beat（`--chars` 可改）。
- 遇到 `。！？` 强制断句。
- 切点 = 词首 − 0.3s。
- 纯数字/单位 → `number`，其余 → `word`。
- 自动黑白蓝红轮换。

它只生成草稿，图片和收尾卡要人补。

---

## 响度与偏移

- 目标：−14 LUFS，TP ≤ −1 dBFS。单遍 `loudnorm` 实测会落在 −15.1 ~ −14 之间，QA 容差 ±1.5。
- AAC 编码有约 **21ms** priming；旁白对齐用 0.3s 提前量吸收，不需要逐帧补偿。
- `-shortest` 只在 `master + copy` 时使用；`build` 用 `-t duration`，避免 AAC 尾巴吃掉最后一帧。
