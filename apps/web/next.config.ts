import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const nextConfig: NextConfig = {
  // Workspace package that ships TypeScript source, not built JS.
  transpilePackages: ['@llm-mbti/questionnaire'],
}

export default createNextIntlPlugin()(nextConfig)
