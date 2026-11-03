import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Code, SettingLabel, TypeChips } from '@/components/ui'
import { Link } from '@/i18n/navigation'
import { getGroups, summarize } from '@/lib/stats'

export const revalidate = 60

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('home')
  const tg = await getTranslations('group')
  const { models, totals } = summarize(await getGroups())

  return (
    <div className="space-y-14">
      <section className="max-w-3xl space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t('title')}</h1>
        <p className="text-ink-2 leading-relaxed">{t('subtitle')}</p>
      </section>

      <section aria-label="totals" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
        {(['runs', 'models', 'providers', 'harnesses'] as const).map((k) => (
          <div key={k} className="bg-surface px-5 py-4">
            <div className="text-3xl font-semibold">{totals[k]}</div>
            <div className="text-sm text-muted">{t(`stats.${k}`)}</div>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t('tableTitle')}</h2>
        {models.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-ink-2">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 font-medium">{t('colModel')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('colGroups')}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t('colRuns')}</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.model} className="border-b border-line align-top last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/model/${encodeURIComponent(m.model)}`} className="font-mono font-medium underline-offset-4 hover:underline">
                        {m.model}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <ul className="space-y-1.5">
                        {m.groups.map((g) => (
                          <li key={g.key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="min-w-36"><SettingLabel group={g} /></span>
                            <TypeChips group={g} max={3} />
                            <span className="tabular text-xs text-muted">{tg('runs', { n: g.runs })}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="tabular px-4 py-3 text-right">{m.runs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-5">
        <h2 className="text-lg font-semibold">{t('participate')}</h2>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-line bg-surface p-5">
            <h3 className="font-medium">{t('skillTitle')}</h3>
            <p className="text-sm leading-relaxed text-ink-2">{t('skillDesc')}</p>
            <Code>{'npx skills add Mieluoxxx/llm-mbti -g'}</Code>
          </div>
          <div className="space-y-3 rounded-xl border border-line bg-surface p-5">
            <h3 className="font-medium">{t('cliTitle')}</h3>
            <p className="text-sm leading-relaxed text-ink-2">{t('cliDesc')}</p>
            <Code>{'npx llm-mbti run --provider deepseek \\\n  --model deepseek-chat --runs 5'}</Code>
          </div>
        </div>
        <p className="text-sm text-muted">{t('privacy')}</p>
      </section>
    </div>
  )
}
