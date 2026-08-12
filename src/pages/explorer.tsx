import { CATEGORIES, plannedSimulators, simulators } from '../simulators/registry';
import { DeviceCard, PlannedCard } from '../components/device-card';

export function ExplorerPage() {
  return (
    <div className="container">
      <div className="section-head" style={{ marginTop: 8 }}>
        <div>
          <p className="eyebrow">Catalog</p>
          <h2>Simulators</h2>
          <p>
            Every device is an independent module with its own configuration, actions, state and
            payloads. Live simulators open in a workspace; planned ones are declared here first.
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
              <span className="chip">{live.length} live</span>
              {planned.length > 0 && <span className="chip">{planned.length} planned</span>}
            </div>
            <div className="grid cards">
              {live.map((s) => (
                <DeviceCard key={s.meta.id} sim={s} />
              ))}
              {planned.map((d) => (
                <PlannedCard key={d.id} device={d} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
