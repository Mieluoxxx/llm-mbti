# llm-mbti

Run an MBTI-style personality questionnaire ([OEJTS 1.2](https://openpsychometrics.org/tests/OJTS/development/OEJTS1.2.pdf), 32 items) against an LLM on your own machine, score it locally, and optionally share the anonymous result.

```sh
npx llm-mbti run --provider deepseek --model deepseek-chat          # key from DEEPSEEK_API_KEY
npx llm-mbti run --base-url https://example.com/v1 --model m --provider my-provider --api-key-env MY_KEY --runs 5
```

```ts
import { runTest } from 'llm-mbti'

const r = await runTest({ provider: 'anthropic', model: 'claude-opus-5-5' })
console.log(r.type, r.dimensions)
await r.upload() // optional
```

Nothing is shared unless you pass `--upload`, answer "y", or call `upload()`. Only the answers and model metadata are sent, never API keys or prompts.

To run the test inside an agent (Claude Code, Codex, OpenCode, …) use the skill: `npx skills add Mieluoxxx/llm-mbti`.

Code is MIT. The bundled questionnaire items are CC BY-NC-SA 4.0 (non-commercial). See [LICENSE](./LICENSE) and the [project README](https://github.com/Mieluoxxx/llm-mbti).
