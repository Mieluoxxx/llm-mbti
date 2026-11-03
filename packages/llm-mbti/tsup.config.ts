import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/cli.ts'],
    format: ['esm'],
    target: 'node22',
    platform: 'node',
    clean: true,
    dts: { entry: 'src/index.ts', resolve: [/^@llm-mbti\/questionnaire/] },
    // The questionnaire package is private to the monorepo, so it has to ship inside this bundle.
    noExternal: ['@llm-mbti/questionnaire'],
  },
  {
    // Self-contained copy for the skill: agents run it with plain `node`, so it
    // must not depend on the npm package being published or installed.
    entry: { 'llm-mbti': 'src/cli.ts' },
    outDir: '../../skills/llm-mbti/scripts',
    outExtension: () => ({ js: '.mjs' }),
    format: ['esm'],
    target: 'node22',
    platform: 'node',
    clean: true,
    splitting: false,
    noExternal: [/.*/],
    minify: true,
  },
])
