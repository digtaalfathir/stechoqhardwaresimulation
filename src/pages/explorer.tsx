import { useState } from 'react';
import { CATEGORIES, categoryCounts, plannedSimulators, simulators } from '../simulators/registry';
import type { Category } from '../simulators/core/types';
import { DeviceCard, PlannedRow } from '../components/device-card';
import { PageBand } from '../components/page-band';
import { useT } from '../lib/i18n';

export function ExplorerPage() {
  const t = useT();
  const [only, setOnly] = useState<Category | null>(null);
  const shown = CATEGORIES.filter((c) => !only || c === only);

  return (
    <>
      <PageBand
        eyebrow={t('explorer.eyebrow', 'Catalog')}
        title={t('explorer.title', 'Simulators')}
        lede={t(
          'explorer.sub',
          'Every device is drawn after the hardware in the field and runs its real behaviour. Live ones open straight into their workspace; planned ones are declared here first.',
        )}
        stats={[
          [String(simulators.length), t('count.live', 'live')],
          [String(plannedSimulators.length), t('count.planned', 'planned')],
          [String(CATEGORIES.length), t('explorer.categories', 'categories')],
        ]}
      />

      <div className="container">
        <div className="filter-bar" role="toolbar" aria-label={t('explorer.filter', 'Filter by category')}>
          <button type="button" className="filter" aria-pressed={!only} onClick={() => setOnly(null)}>
            {t('explorer.all', 'All')} <span>{simulators.length + plannedSimulators.length}</span>
          </button>
          {CATEGORIES.map((c) => {
            const n = categoryCounts(c);
            return (
              <button key={c} type="button" className="filter" aria-pressed={only === c} onClick={() => setOnly(only === c ? null : c)}>
                {c} <span>{n.live + n.planned}</span>
              </button>
            );
          })}
        </div>

        {shown.map((category) => {
          const live = simulators.filter((s) => s.meta.category === category);
          const planned = plannedSimulators.filter((s) => s.category === category);
          if (!live.length && !planned.length) return null;
          return (
            <section className="category-block" key={category}>
              <div className="category-head">
                <h3>{category}</h3>
                {live.length > 0 && (
                  <span className="chip t-ok">
                    {live.length} {t('count.live', 'live')}
                  </span>
                )}
                {planned.length > 0 && (
                  <span className="chip">
                    {planned.length} {t('count.planned', 'planned')}
                  </span>
                )}
              </div>
              {live.length > 0 && (
                <div className="cards">
                  {live.map((s) => (
                    <DeviceCard key={s.meta.id} sim={s} />
                  ))}
                </div>
              )}
              {planned.length > 0 && (
                <div className={`planned-grid${live.length ? ' after-cards' : ''}`}>
                  {planned.map((d) => (
                    <PlannedRow key={d.id} device={d} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
