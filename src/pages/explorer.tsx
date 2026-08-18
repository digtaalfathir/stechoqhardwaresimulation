import { CATEGORIES, plannedSimulators, simulators } from '../simulators/registry';
import { DeviceCard, PlannedRow } from '../components/device-card';
import { useT } from '../lib/i18n';

export function ExplorerPage() {
  const t = useT();
  return (
    <div className="container">
      <div className="section-head" style={{ marginTop: 8 }}>
        <div>
          <p className="eyebrow">{t('explorer.eyebrow', 'Catalog')}</p>
          <h2>{t('explorer.title', 'Simulators')}</h2>
          <p>
            {t(
              'explorer.sub',
              'Every device is an independent module with its own configuration, actions, state and payloads. Live simulators open in a workspace; planned ones are declared here first.',
            )}
          </p>
        </div>
      </div>

      {CATEGORIES.map((category) => {
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
              <div className="grid cards">
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
  );
}
