import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'
import { harnessName } from '@/components/ui'
import { Link } from '@/i18n/navigation'
import { getRecentRuns } from '@/lib/stats'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return { title: (await getTranslations({ locale, namespace: 'data' }))('title') }
}

export default async function DataPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('data')
  const tg = await getTranslations('group')
  const format = await getFormatter()
  const runs = await getRecentRuns(100)

  return (
    <div className="space-y-8">
      <div className="max-w-3xl space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="leading-relaxed text-ink-2">{t('intro')}</p>
        <div className="flex flex-wrap gap-3 pt-1">
          <a href="/api/export?format=csv" className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-neutral">
            {t('exportCsv')}
          </a>
          <a href="/api/export?format=json" className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-neutral">
            {t('exportJson')}
          </a>
        </div>
        <p className="text-xs text-muted">{t('license')}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('recent')}</h2>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-2.5 font-medium">{t('colTime')}</th>
                <th className="px-4 py-2.5 font-medium">{t('colModel')}</th>
                <th className="px-4 py-2.5 font-medium">{t('colSetting')}</th>
                <th className="px-4 py-2.5 font-medium">{t('colType')}</th>
                <th className="px-4 py-2.5 font-medium">{t('colBy')}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className={`border-b border-line last:border-0 ${r.flags.length ? 'text-muted' : ''}`}>
                  <td className="tabular whitespace-nowrap px-4 py-2 text-ink-2">
                    {format.dateTime(new Date(r.created_at), { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/model/${encodeURIComponent(r.model_id)}`} className="font-mono hover:underline">{r.model_id}</Link>
                  </td>
                  <td className="px-4 py-2">
                    {r.channel === 'api' ? tg('api') : harnessName(r.harness ?? '')} · {r.provider}
                  </td>
                  <td className="px-4 py-2 font-mono font-semibold">
                    {r.type}
                    {r.flags.length > 0 && <span className="ml-2 font-sans text-xs font-normal">({r.flags.join(', ')})</span>}
                  </td>
                  <td className="px-4 py-2 text-ink-2">
                    {r.source === 'official' ? t('official') : (r.nickname ?? t('anonymous'))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
