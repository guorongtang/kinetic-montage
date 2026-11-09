# kinetic-montage

给 agent 用的「v13 风格」视频生成器：**声明式时间轴 → 确定性 canvas 渲染 → ffmpeg 合成**。

一条 30 秒片子 = 43 个镜头 × 平均 0.52 秒 + 8 秒 logo 收尾。
`timeline.json` 是唯一事实源；改文案、换图、调节奏都不用碰渲染代码。

---

## 已验证

| 测试 | 结果 |
|---|---|
| v13 回归：900 帧逐张对比 | **900/900 md5 相同** |
| v13 回归：成片对比 | **md5 相同**（`49c19e0e0236d74d39b3d6de8c26c6eb`，7,050,438 字节） |
| 渲染速度 | 900 帧 / 36–38 秒（M4 Pro，单 Chromium） |
| 12 秒最小样例 | 360 帧 / 8 秒；QA PASS |
| 确定性 | 同一 `t` 跑两次，字节一致 |

回归命令：`npm test`（12 帧 PSNR）、`npm run regress`（整片 md5）。

回归样例：`examples/v13-regression/`（自带 43 镜 timeline、12 张参考帧、原音轨）。

---

## 快速开始

```bash
# 依赖（只需一次）
npm install
npx playwright install chromium
node bin/kinetic.mjs doctor

# 新项目
node bin/kinetic.mjs init my-film --title "我的产品" --duration 30
cd my-film
# 改 timeline.json / 放 assets/ → 回到 skill 目录执行：
node ../bin/kinetic.mjs check .
node ../bin/kinetic.mjs build . --name my-film
```

产物：

```
out/my-film.mp4
out/qa.md
out/contact-sheet.png
```

也可以先跑自带的例子：

```bash
node bin/kinetic.mjs build examples/12s-min --name 12s-min
open examples/12s-min/out/12s-min.mp4
```

---

## 命令

| 命令 | 作用 |
|---|---|
| `doctor` | 检查 node / ffmpeg / Chromium / 字体 |
| `init <dir>` | 生成可跑的项目骨架 |
| `check <dir>` | schema + 素材 + 节奏 lint（不渲染） |
| `draft <dir> --words <json>` | 按词级时间戳生成初版镜头表 |
| `still <dir> --t 3.2` | 单帧预览 |
| `sheet <dir>` | 每个镜头一张，拼成 `out/sheet.png` |
| `preview <dir>` | 本地播放器（`http://127.0.0.1:4173`） |
| `render <dir>` | 只出帧 → `work/frames/` |
| `mix <dir>` | 只混音 → `out/master.wav` |
| `build <dir>` | render + mix + encode + qa |
| `qa <dir> --video <mp4>` | 技术 + 风格报告 |
| `eject <dir>` | 把引擎源码复制进项目，允许硬改 |

---

## 目录

```
kinetic-montage/
├─ SKILL.md                 # agent 读这个
├─ bin/kinetic.mjs          # CLI
├─ lib/                     # spec / render / audio / encode / qa / draft / preview
├─ engine/                  # Canvas 渲染器（core / cards / engine + 内置字体）
├─ presets/v13.json         # 风格常数
├─ schema/timeline.schema.json
├─ templates/project/       # film.md / script.md / timeline.json
├─ docs/                    # style-spec / audio / troubleshooting
├─ examples/
│  ├─ v13-regression/       # 与 v13 逐字节一致的回归
│  └─ 12s-min/              # 12 秒最小样例
└─ tools/                   # 开发用：提取 v13 时间轴、逐帧比对
```

---

## 设计原则

1. **风格是数据**：颜色、字号、入场时长、碎片窗口、节奏全部在 `presets/v13.json`。
2. **渲染是纯函数**：`draw(t)` 只依赖 `t` 和 `timeline.json`；随机数用 seeded hash。
3. **QA 是门禁**：时长/帧数/响度/静止段/风格指纹，不过不算交付。
4. **逃生口**：`eject` 把引擎复制进项目，之后 `--engine .` 用改过的版本。

---

## 依赖

- node ≥ 20
- ffmpeg ≥ 6（`brew install ffmpeg` / `apt install ffmpeg`）
- Playwright Chromium（约 120MB，`npx playwright install chromium`）
- 字体：macOS 用 Avenir Next Condensed + PingFang SC；其他平台自动用内置
  Archivo Narrow + Noto Sans SC（OFL，随包）

---

## 边界

- 只支持 1920×1080 / 30fps（引擎按 30fps 计算帧号）
- 转场只有硬切 + 碎片；没有叠化、推拉、3D
- 音频 AAC 编码有约 21ms priming 偏移；旁白对齐按 0.3s 提前量吸收
- `examples/` 里的截图/音轨来自参考项目，**仅本地回归用**；对外分发前请删除或替换
- 字体许可：Archivo Narrow、Noto Sans SC 均为 SIL OFL；见 `engine/fonts/`
