import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return { title: (await getTranslations({ locale, namespace: 'about' }))('title') }
}

const SECTIONS = ['what', 'q', 'score', 'channels', 'quality', 'privacy', 'license'] as const

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('about')

  return (
    <article className="max-w-3xl space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
      {SECTIONS.map((s) => (
        <section key={s} className="space-y-2">
          <h2 className="text-lg font-semibold">{t(`${s}Title`)}</h2>
          <p className="leading-relaxed text-ink-2">{t(s)}</p>
        </section>
      ))}
      <p className="text-sm text-muted">
        <a className="underline underline-offset-4 hover:text-ink" href="https://openpsychometrics.org/tests/OJTS/development/OEJTS1.2.pdf">
          OEJTS 1.2 (PDF)
        </a>
        {' · '}
        <a className="underline underline-offset-4 hover:text-ink" href="https://creativecommons.org/licenses/by-nc-sa/4.0/">
          CC BY-NC-SA 4.0
        </a>
      </p>
    </article>
  )
}
