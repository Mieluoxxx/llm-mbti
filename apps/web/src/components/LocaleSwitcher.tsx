'use client'

import { useLocale, useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'

const NAMES: Record<string, string> = { zh: '中文', en: 'English', ja: '日本語', ko: '한국어' }

export function LocaleSwitcher() {
  const locale = useLocale()
  const pathname = usePathname()
  const t = useTranslations('nav')
  return (
    <nav aria-label={t('language')} className="flex gap-1 text-xs">
      {routing.locales.map((l) => (
        <Link
          key={l}
          href={pathname}
          locale={l}
          aria-current={l === locale ? 'true' : undefined}
          className={`rounded px-1.5 py-1 ${l === locale ? 'bg-surface font-semibold text-ink ring-1 ring-line' : 'text-muted hover:text-ink'}`}
        >
          {NAMES[l]}
        </Link>
      ))}
    </nav>
  )
}
