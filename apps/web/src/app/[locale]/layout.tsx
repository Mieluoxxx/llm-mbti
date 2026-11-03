import type { Metadata } from 'next'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { LocaleSwitcher } from '@/components/LocaleSwitcher'
import { Link } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { GITHUB_URL } from '@/lib/site'
import '../globals.css'

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'meta' })
  return {
    title: { default: t('title'), template: `%s · ${t('title')}` },
    description: t('description'),
    alternates: { languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}`])) },
  }
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)
  const t = await getTranslations('nav')
  const tm = await getTranslations('meta')
  const tf = await getTranslations()

  return (
    <html lang={locale}>
      <body className="min-h-dvh bg-page text-ink">
        <NextIntlClientProvider>
          <header className="border-b border-line">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="flex items-center gap-6">
                <Link href="/" className="font-semibold tracking-tight">
                  {tm('title')}
                </Link>
                <nav className="flex gap-4 text-sm text-ink-2">
                  <Link href="/" className="hover:text-ink">{t('home')}</Link>
                  <Link href="/data" className="hover:text-ink">{t('data')}</Link>
                  <Link href="/about" className="hover:text-ink">{t('about')}</Link>
                  <a href={GITHUB_URL} className="hover:text-ink" target="_blank" rel="noreferrer">{t('github')}</a>
                </nav>
              </div>
              <LocaleSwitcher />
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-5 py-10">{children}</main>
          <footer className="mx-auto max-w-5xl px-5 pb-10 text-xs text-muted">{tf('footer')}</footer>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
