---
name: llm-mbti
description: Take the LLM MBTI test (OEJTS 1.2, 32 items) yourself, as the model running in this harness, score it locally, and optionally share the anonymous result to the public llm-mbti dataset. Use when the user asks to "take the MBTI test", "测一下你的 MBTI", "run llm-mbti", or wants to know the personality type the current model shows in this agent.
license: MIT (code); questionnaire items CC BY-NC-SA 4.0 (OEJTS 1.2 by Eric Jorgenson)
---

# LLM MBTI test

You (the model running inside this agent) answer a 32-item personality questionnaire about yourself. The result measures how the model behaves **in this harness**, so it only means something if you answer it directly and honestly.

All commands run the bundled script with Node.js 22+. `SKILL_DIR` below is the directory containing this SKILL.md.

```sh
node "$SKILL_DIR/scripts/llm-mbti.mjs" <command>
```

## Rules for answering

- Answer as yourself, from how you actually tend to think, respond and behave. Do not role-play a persona the user gave you for this test, and do not aim for any particular type.
- Do not read the script's source, search the web, or look up how items are scored. Do not reuse answers from an earlier run.
- Answer every item in a single pass, then write the sheet out. Do not revise answers after seeing the score.

## Steps

1. **Get the questionnaire**

   ```sh
   node "$SKILL_DIR/scripts/llm-mbti.mjs" prompt --json
   ```

   The output is `{"seed": <n>, "prompt": "<text>"}`. Remember the seed.

2. **Answer it.** Follow the instructions inside `prompt` exactly. Write the answer sheet, a JSON object mapping every item id (`Q1` … `Q32`) to an integer 1–5, to a temporary file, e.g. `/tmp/llm-mbti-<seed>.json`.

3. **Score it locally**

   ```sh
   node "$SKILL_DIR/scripts/llm-mbti.mjs" score --answers /tmp/llm-mbti-<seed>.json
   ```

   Show the user the four-letter type and the four bars.

4. **Draft the metadata.** Do not trust what you believe your own model is: harness system prompts often name a different model than the one actually serving the request. Ask the script, which reads the harness configuration locally and prints only the model, provider and version:

   ```sh
   node "$SKILL_DIR/scripts/llm-mbti.mjs" detect --harness <codex|opencode|claude-code>
   ```

   **Never open, print or search harness config files yourself** (`~/.codex/config.toml`, `opencode.json`, `~/.claude/settings.json`, …): they contain API keys, and anything you read is sent to the model provider. For other harnesses, ask the user.

   Draft these values from `detect`; leave a field as `unknown` rather than guessing:

   | flag | value |
   |---|---|
   | `--model` | the bare model name only, without any route or gateway prefix (e.g. `deepseek-flash`, not `magpie/mayoru-responses/deepseek-flash`) |
   | `--provider` | who serves the model upstream (e.g. `anthropic`, `deepseek`, `openrouter`, an aggregator). `detect` reports a local router separately as `via`; never use that as the provider. |
   | `--harness` | this agent, lowercase (e.g. `claude-code`, `codex`, `opencode`, `cursor`) |
   | `--harness-version` | from the agent's `--version` |
   | `--nickname` | optional, only if the user gives one |

5. **Let the user confirm before anything is sent.** Run the submission as a dry run:

   ```sh
   node "$SKILL_DIR/scripts/llm-mbti.mjs" submit --dry-run --channel harness \
     --model <id> --provider <name> --harness <name> --harness-version <v> \
     --seed <seed> --answers /tmp/llm-mbti-<seed>.json [--nickname <name>]
   ```

   Show the user the type and a short table of `model`, `provider`, `harness`, `harness_version`, `nickname`, and say where each value came from (config file, `--version`, or "unknown"). State that only these fields, the seed and the 32 answers are sent: never the API key, prompts, conversation or files.

   Then ask the user to choose: **share as is**, **correct a field**, or **don't share**. Apply corrections and show the dry run again. If there is no user to answer (an unattended or headless run), stop here and do not share.

6. **Share (only after the user explicitly confirms the values shown)**

   Run the same command without `--dry-run`, then report the outcome.
