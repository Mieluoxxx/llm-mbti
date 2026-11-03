# 大模型 MBTI 测试 · llm-mbti

同一个模型，换一家供应商、换一个 harness，表现出来的"性格"还一样吗？

llm-mbti 让模型在**你自己的机器上**做一份 MBTI 风格的人格问卷，本地直接得出结果。你可以选择把结果匿名上传到公开网站，和大家的数据放在一起对比：

- **纯 API**：模型裸跑，不经过任何 harness
- **harness**：模型在 Claude Code、Codex、Cursor、OpenCode 等 agent 环境里作答

统计按 `模型 × 供应商 × harness` 分组，观察 harness 和供应商会不会让模型的人格发生偏移。

> 本项目是非商业的研究性项目。结果反映的是模型在特定条件下的**作答倾向**，不代表模型"真的有"人格。

## 状态

| 模块 | 状态 |
|---|---|
| 题库 + 计分 + 提交协议（`packages/questionnaire`） | ✅ 完成 |
| npm 包：SDK + CLI（`llm-mbti`） | ✅ 可用，尚未发布到 npm |
| skill | ✅ 已在 OpenCode、Codex 中实测 |
| 上传接口 + 数据库 | 🚧 开发中（在此之前上传会失败） |
| 网站（收集 + 展示，中 / 日 / 英 / 韩） | 🚧 开发中 |

## 参与方式

### 方式一：在 harness 里跑 skill

用 [skills CLI](https://github.com/vercel-labs/skills) 安装，支持 Claude Code、Codex、Cursor、OpenCode 等几十种 agent：

```sh
npx skills add Mieluoxxx/llm-mbti -g
```

然后在 harness 里让 agent 运行这个 skill。流程是：

1. agent 用 skill 自带的脚本拿到题目，自己作答，在本地算出 MBTI
2. 脚本读取 harness 配置，检测出模型名、上游供应商和 harness 版本（`detect`）。agent 不会自己打开配置文件，因为里面可能有 API key
3. 把要上传的内容展示给你：**直接上传 / 修改字段 / 不上传**，由你决定

skill 自带一个独立的脚本（`skills/llm-mbti/scripts/llm-mbti.mjs`），只需要 Node.js 22+，不依赖 npm 包。

### 方式二：纯 API（CLI）

```sh
npx llm-mbti run --provider deepseek --model deepseek-chat
npx llm-mbti run --base-url https://example.com/v1 --model some-model --provider my-provider
```

支持 Anthropic 和 OpenAI 兼容接口。API key 从环境变量读取（`--api-key-env` 可以指定变量名），**只在本地使用**。不会发送 system prompt，也不设置 temperature 等采样参数，测的是供应商默认提供的模型。

```sh
npx llm-mbti run ... --runs 5           # 跑 5 次，默认最多同时 5 个，最后给出类型分布和均值 ± 标准差
npx llm-mbti prompt --json              # 输出题目和种子（给自己作答的 agent 用）
npx llm-mbti score --answers a.json     # 给一份答卷计分
npx llm-mbti detect --harness codex     # 只读出 harness 配置里的模型、供应商、版本
npx llm-mbti submit ... --dry-run       # 预览将要上传的内容
npx llm-mbti schema                     # 输出提交协议的 JSON Schema
```

默认不上传：交互模式下会询问，否则要加 `--upload`。

### 方式三：作为库使用（SDK）

```ts
import { runTest } from 'llm-mbti'

const result = await runTest({
  provider: 'deepseek',
  model: 'deepseek-chat',
  apiKey: process.env.DEEPSEEK_API_KEY,
})

console.log(result.type)   // e.g. "INTJ"
await result.upload()      // 可选
```

### 方式四：按协议自己接入

任何工具都可以按[提交协议](#提交协议)直接上传数据。上传的地址可以配置，默认是本项目的网站。

## 隐私

**只会上传**：作答结果和下面列出的元数据。

**绝不上传**：API key、system prompt / CLAUDE.md 等提示词、对话内容、文件或项目名称。

上传默认关闭，每次都需要你主动确认。昵称是可选的，不需要注册账号。

## 问卷

使用 **Open Extended Jungian Type Scales 1.2**（OEJTS 1.2，作者 Eric Jorgenson）：

- 32 道题，每道题是一对描述，用 1–5 分作答，例如 `makes lists <1 2 3 4 5> relies on memory`
- 四个维度：I/E、S/N、F/T、J/P，每个维度 8 道题
- 计分规则与[官方公式](https://openpsychometrics.org/tests/OJTS/development/OEJTS1.2.pdf)完全等价（测试里用官方公式逐字对照了 2000 份随机答卷）
- 输出四字母类型，以及每个维度 0–100% 的连续得分（数值越大越偏向 E / N / T / P）

所有题目都**只用英文**、**整卷一次作答**，题序用随机种子打乱。种子会随结果一起上传，服务端可以复现题序。

给模型的作答说明（prompt）也是问卷的一部分，带版本号（`prompt_version`），改动后版本号必须递增。

OEJTS 不是 MBTI®，和 The Myers-Briggs Company 没有任何关联。

## 提交协议

`POST /api/runs`，请求体是 JSON，当前 `protocol_version` 为 `1`：

| 字段 | 必填 | 说明 |
|---|---|---|
| `protocol_version` | ✅ | `1` |
| `questionnaire_version` | ✅ | `"oejts-1.2"` |
| `prompt_version` | ✅ | `1` |
| `channel` | ✅ | `"api"` 或 `"harness"` |
| `model_id` | ✅ | 模型名，例如 `claude-opus-5-5`。路由前缀会被去掉：`magpie/mayoru-responses/deepseek-flash` 存为 `deepseek-flash` |
| `provider` | ✅ | 上游供应商，例如 `anthropic`、`deepseek`、`opencode-go`、聚合平台名。经过本地网关时填网关背后的上游 |
| `harness` | harness 方式必填 | 例如 `claude-code`、`codex`；`api` 方式不能带 |
| `harness_version` | | harness 的版本 |
| `seed` | ✅ | 打乱题序用的随机种子（0 – 2³²−1） |
| `item_order` | ✅ | 实际出题顺序，必须和 `seed` 推导出来的一致 |
| `answers` | ✅ | `{ "Q1": 3, ..., "Q32": 5 }`，必须覆盖全部 32 题 |
| `client` | ✅ | `{ "name": "...", "version": "..." }` |
| `nickname` | | 可选昵称，最多 32 个字符 |
| `device_key` | | 本地随机生成的匿名设备标识，服务端只存它的 hash |

服务端**不信任客户端算出来的分数**，只接收原始作答，用同一套代码重新计分。完整的 JSON Schema 可以通过 `submissionJsonSchema()` 导出。

## 项目结构

```
llm-mbti/
├─ packages/questionnaire   # 题库 + 计分 + 提交协议（SDK、skill、服务端共用）
├─ packages/llm-mbti        # npm 包：SDK + CLI
├─ skills/llm-mbti          # SKILL.md + 打包好的独立脚本，供 npx skills add 安装
├─ apps/web                 # Next.js 网站，部署在 Vercel（开发中）
└─ supabase/                # 数据库 migrations（开发中）
```

## 开发

需要 Node.js 22+ 和 pnpm。

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm --filter llm-mbti build   # 同时会重新生成 skills/llm-mbti/scripts/llm-mbti.mjs
```

`skills/llm-mbti/scripts/llm-mbti.mjs` 是构建产物，改了 SDK 或 CLI 之后要重新构建并提交。

## 许可证

- **代码**：[MIT](./LICENSE)
- **npm 包和 skill 脚本**：代码是 MIT，但里面打包了问卷题目，所以整体是 `MIT AND CC-BY-NC-SA-4.0`
- **问卷题目**（`packages/questionnaire/data/`）：来自 OEJTS 1.2，采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)，**不能商用**，详见 [data/LICENSE](./packages/questionnaire/data/LICENSE)
- **公开数据集**：同样以 CC BY-NC-SA 4.0 发布
