import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { DimensionBars } from '@/components/DimensionBars'
import { SettingLabel, TypeChips, harnessName } from '@/components/ui'
import { Link } from '@/i18n/navigation'
import { DIMS, baselineFor, getGroups, sortGroups } from '@/lib/stats'

export const revalidate = 60

type Params = Promise<{ locale: string; model: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { model } = await params
  return { title: decodeURIComponent(model) }
}

export default async function ModelPage({ params }: { params: Params }) {
  const { locale, model: raw } = await params
  setRequestLocale(locale)
  const model = decodeURIComponent(raw)
  const t = await getTranslations('model')
  const tg = await getTranslations('group')

  const all = await getGroups()
  const groups = sortGroups(all.filter((g) => g.model === model))
  const runs = groups.reduce((s, g) => s + g.runs, 0)

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <Link href="/" className="text-sm text-muted hover:text-ink">← {t('back')}</Link>
        <h1 className="font-mono text-3xl font-semibold tracking-tight">{model}</h1>
        {groups.length > 0 && <p className="text-ink-2">{t('summary', { runs, groups: groups.length })}</p>}
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-ink-2">{t('notFound')}</p>
      ) : (
        <>
          {groups.some((g) => baselineFor(g, all)) && (
            <p className="flex items-center gap-2 text-sm text-ink-2">
              <span aria-hidden className="inline-block h-4 w-0.5 rounded-full bg-ink" />
              {t('baselineHint')}
            </p>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            {groups.map((g) => (
              <section key={g.key} className="space-y-4 rounded-xl border border-line bg-surface p-5">
                <header className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-base"><SettingLabel group={g} /></h2>
                  <span className="tabular text-sm text-muted">
                    {tg('runs', { n: g.runs })}
                    {g.officialRuns > 0 && ` · ${tg('official', { n: g.officialRuns })}`}
                  </span>
                </header>
                <DimensionBars group={g} baseline={baselineFor(g, all)} />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted">{t('typeDist')}</span>
                  <TypeChips group={g} max={6} />
                </div>
                {g.runs < 5 && <p className="text-xs text-muted">{t('lowN')}</p>}
              </section>
            ))}
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{t('tableTitle')}</h2>
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="px-4 py-2.5 font-medium">{t('colSetting')}</th>
                    <th className="px-4 py-2.5 text-right font-medium">{t('colRuns')}</th>
                    {DIMS.map((d) => (
                      <th key={d.id} className="px-4 py-2.5 text-right font-medium">% {d.pos}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tabular">
                  {groups.map((g) => (
                    <tr key={g.key} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5">
                        {g.channel === 'api' ? tg('api') : harnessName(g.harness)} · {g.provider}
                      </td>
                      <td className="px-4 py-2.5 text-right">{g.runs}</td>
                      {DIMS.map((d) => (
                        <td key={d.id} className="px-4 py-2.5 text-right">
                          {g.mean[d.id].toFixed(1)}
                          <span className="text-muted"> ± {g.sd[d.id].toFixed(1)}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
