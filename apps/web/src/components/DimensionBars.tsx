import { getTranslations } from 'next-intl/server'
import { DIMS, type Group } from '@/lib/stats'

const pct = (v: number) => Math.max(0, Math.min(100, v))

/**
 * Diverging bars around the 50% boundary: the bar grows from the centre
 * toward the pole the mean leans to, with a ±sd whisker and, for harness
 * settings, a tick at the API baseline of the same model and provider.
 */
export async function DimensionBars({ group, baseline }: { group: Group; baseline?: Group }) {
  const t = await getTranslations('dims')
  const tm = await getTranslations('model')

  return (
    <div className="space-y-3">
      {DIMS.map((d) => {
        const mean = pct(group.mean[d.id])
        const sd = group.sd[d.id]
        const leansPos = mean > 50
        const lean = leansPos ? d.pos : d.neg
        const strength = leansPos ? mean : 100 - mean
        const left = Math.min(mean, 50)
        const width = Math.abs(mean - 50)
        const base = baseline ? pct(baseline.mean[d.id]) : undefined
        const tip = [
          `${t(d.neg)} ${(100 - mean).toFixed(1)}% · ${t(d.pos)} ${mean.toFixed(1)}%`,
          `${tm('meanSd')}: ${mean.toFixed(1)} ± ${sd.toFixed(1)}`,
          base !== undefined ? `${tm('baseline')}: ${base.toFixed(1)}` : null,
        ]
          .filter(Boolean)
          .join('\n')

        return (
          <div key={d.id} className="group/bar relative grid grid-cols-[3rem_1fr_3rem_3.5rem] sm:grid-cols-[5rem_1fr_5rem_3.5rem] items-center gap-3 text-sm">
            <span className={`text-right ${!leansPos ? 'font-semibold text-ink' : 'text-muted'}`}>
              {d.neg} <span className="hidden sm:inline">{t(d.neg)}</span>
            </span>

            <div className="relative h-6" aria-label={tip} role="img">
              <div className="absolute inset-y-[11px] inset-x-0 rounded-full bg-neutral" />
              <div className="absolute inset-y-0 left-1/2 w-px bg-axis" />
              {sd > 0 && (
                <div
                  className="absolute top-1/2 h-px -translate-y-1/2 bg-ink-2/60"
                  style={{ left: `${pct(mean - sd)}%`, width: `${pct(mean + sd) - pct(mean - sd)}%` }}
                />
              )}
              <div
                className={`bar-fill absolute inset-y-[7px] ${leansPos ? 'rounded-r bg-pos' : 'rounded-l bg-neg'}`}
                style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
              />
              {base !== undefined && (
                <div
                  className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-ink ring-2 ring-surface"
                  style={{ left: `${base}%` }}
                />
              )}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-pre rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-2 shadow-sm group-hover/bar:block">
                {tip}
              </div>
            </div>

            <span className={`tabular ${leansPos ? 'font-semibold text-ink' : 'text-muted'}`}>
              {d.pos} <span className="hidden sm:inline">{t(d.pos)}</span>
            </span>

            <span className="tabular text-right text-ink-2">
              {lean} {strength.toFixed(0)}%
            </span>
          </div>
        )
      })}
    </div>
  )
}
