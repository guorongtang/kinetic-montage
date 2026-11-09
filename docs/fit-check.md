# 适配判断（fit）

这个判断只回答一件事：**这个网站/产品能不能用 kinetic-montage 做一条 15–30 秒的快切字卡片？**

结论在进入制作之前给出。没有 `fit` 结论，不要 `init`。

---

## 1. 规则

一句话：

> 只要有一个真实、可达的动作，并且至少有一张能截到的真实页面，就适合。

网站默认有页面，所以实际上**动作是唯一硬门槛**；截图数量是制作准备度，不是适合性。

### 动作

算动作的包括：

- 注册、开始使用、免费试用
- 购买、加入购物车、预购、支持众筹
- 预约、报名、预约 demo、咨询
- 下载、安装
- 投递、申请
- 订阅、联系、加入 waitlist
- 关注、分享、捐款、投票

规则：

- 不要求全站只有一个动作。为这条片子选一个主行动，其他记为 `secondary`。
- 动作必须真实可达：点下去有表单/收银台/下载/确认页。
- 死链、占位、“即将上线且没有 waitlist”、已结束且没有候补 → 不算动作。
- 动作强度只影响 `confidence`，不影响 `fit`。

### 界面

算界面的包括：

- 产品 UI：dashboard、编辑器、结果页、设置
- 内容页：文章、文档、课程页
- 服务页：活动页、预约表单、收银台、确认页
- 品牌/作品页、社区 feed、waitlist 落地页、插件面板、小程序页面

要求：

- 至少 1 张；4–8 张是制作准备度。
- 真实截图，不是 mockup、stock photo、Figma 稿、应用商店宣传图。
- 桌面截图 ≥1600px 宽；手机/竖屏 ≥1080px 宽（长边 ≥1600）。
- 不要真实用户 PII。
- 静态图能看懂；如果价值只能靠录屏/动画表达，静态截图会丢信息，记 `needs_evidence`。

---

## 2. 结论

| 结论 | 条件 | 下一步 |
|---|---|---|
| `fit` | 有动作 + 至少 1 张可截图页面 | 允许 `init`；截图少只 warning |
| `needs_evidence` | 有动作，但界面/动作路径暂时拿不到 | 补 demo/账号/截图；补不到转 `not_fit` |
| `not_fit` | 没动作；动作假的/不可达；补不到可截图界面 | 停止 |
| `not_applicable` | 非网站目标（纯主题片、回归样例） | 允许制作，记录原因 |

`needs_evidence` 不是“勉强适合”，是“还没判断完”。它不会放行制作。

### 什么情况才算 `not_fit`

只有三条：

1. 没有任何动作：纯介绍页，没有按钮/表单/下载/联系/订阅/购买/预约。
2. 动作是假的/不可达：死链、占位、仅“即将上线”且无 waitlist、活动已结束且无候补、按钮点了没反应。
3. 有动作但完全没有可截图的界面，且补不到：纯重定向、纯 PDF、纯视频、纯电话，或全部在登录墙后且无 demo。

除此之外，不按“内容站/品牌站/社区/企业首页/waitlist”等类型排除。

---

## 3. `fit.json`

复制 `templates/fit.json`，把截图放进 `fit/`，然后填真实信息：

```json
{
  "version": 1,
  "target": {
    "type": "website",
    "name": "Example Blog",
    "url": "https://blog.example.com"
  },
  "category": "content",
  "action": {
    "type": "subscribe",
    "label": "订阅更新",
    "primary": true,
    "status": "verified",
    "terminal": "订阅确认页",
    "strength": "medium",
    "secondary": ["联系作者"]
  },
  "interface": {
    "real": true,
    "capturable": true,
    "authRequired": false,
    "screens": [
      {
        "role": "entry",
        "path": "fit/01-entry.png",
        "width": 1920,
        "height": 1080,
        "shows": "文章页 + 订阅框"
      },
      {
        "role": "action",
        "path": "fit/02-action.png",
        "width": 1920,
        "height": 1080,
        "shows": "邮箱输入 + 订阅按钮"
      },
      {
        "role": "result",
        "path": "fit/03-result.png",
        "width": 1920,
        "height": 1080,
        "shows": "订阅确认"
      }
    ]
  },
  "evidence": {
    "numbers": [
      { "value": "12 篇", "source": "本周更新" }
    ],
    "notes": "订阅动作清晰；截图数量偏少。"
  },
  "nextStep": "补 1–2 张文章列表/作者页可提升完成度",
  "checkedAt": "2026-11-09"
}
```

字段说明：

| 字段 | 说明 |
|---|---|
| `target.type` | `website` / `app` / `miniprogram` / `plugin` / `none` |
| `target.url` | `website` 必填 |
| `target.ref` | App/小程序/插件填商店链接、二维码说明或插件地址 |
| `action.type` | 见下面的枚举 |
| `action.status` | `verified`（已验证可达）/ `blocked`（登录墙、付费墙）/ `broken`（死链、已结束） |
| `action.strength` | 可省略；默认按类型算 |
| `interface.real` | 不是 mockup/stock/Figma |
| `interface.capturable` | 能拿到截图 |
| `screens[].role` | `entry` / `content` / `action` / `result` / `detail` / `other` |
| `screens[].shows` | 这张图证明什么 |
| `evidence.numbers` | 真实数字 + 出处；没有就空数组 |
| `nextStep` | `needs_evidence` 时要补什么 |

`action.type` 枚举：

```text
signup start purchase book download apply subscribe contact
waitlist demo donate follow share other
```

动作强度：

```text
strong: signup start purchase book download apply demo
medium: subscribe contact waitlist donate other
weak:   follow share
```

不写 `verdict`。`verdict` 由 `kinetic fit` 计算，避免手填。  
`checkedAt` 超过 30 天会给 warning；网站改版后重新截、重新跑。

---

## 4. 命令

```bash
# 判断（离线校验，不联网）
node bin/kinetic.mjs fit fit.json
node bin/kinetic.mjs fit fit.json --json

# 通过后建项目
node bin/kinetic.mjs init my-film --fit fit.json

# 非网站目标
node bin/kinetic.mjs init my-film --topic "纯主题片"
```

退出码：

| 码 | 含义 |
|---|---|
| 0 | `fit` 或 `not_applicable` |
| 2 | `not_fit` |
| 3 | `needs_evidence` |
| 4 | `fit.json` 格式或素材错误 |

`init --fit` 只接受 `fit`；`not_fit` / `needs_evidence` 会拒绝创建。`init --topic` 会写一个 `not_applicable` 的 `fit.json`。

`build` 默认不拦老项目；项目里有 `fit.json` 时会校验。要强制门禁：

```bash
node bin/kinetic.mjs build . --require-fit
```

---

## 5. 例子

### 适合：博客订阅

- 动作：订阅更新（`subscribe`，`verified`）
- 截图：文章页、订阅框、确认页
- 结论：`fit`，`confidence: medium`
- 成片：文章页 + 订阅动作 + 一句“每周 12 篇”的字卡；截图少就多用 word/number。

### 适合：作品集联系

- 动作：预约咨询（`contact`，`verified`）
- 截图：作品页、联系表单、确认页
- 结论：`fit`
- 成片：作品画面 + “聊 30 分钟” + 表单。

### 适合：waitlist

- 动作：加入 waitlist（`waitlist`，`verified`）
- 截图：落地页、邮箱表单、确认页
- 结论：`fit`，`confidence: low`，`productionReady: false`
- 成片：字卡为主，截图只做点缀。

### 不适合：纯介绍页

- 页面只有公司简介、团队照片、地址，没有任何按钮/表单/下载/购买/联系。
- 结论：`not_fit`，`no_action`。

### 待补证据：登录墙 SaaS

- 动作：预约 demo（`demo`，`blocked`）
- 页面需要登录，没有 demo 账号。
- 结论：`needs_evidence`；拿到 demo 账号后补 dashboard 截图，再判 `fit`。

---

## 6. 和成片的关系

- `fit` 只说明“能按这个结构做”，不说明“值得做”。
- 通过后仍然要写 `film.md`：一句话主张、受众、三个真证据、CTA。
- `fit.action.label` 应该成为 endcard 的 CTA；不一致时 `check` 会提醒。
- 截图少于 4 张时，成片多用 `word` / `number`，不要硬凑截图。
