import { getSimulator, simulators } from '../simulators/registry';
import { Workspace } from '../components/workspace';
import { DeviceCard } from '../components/device-card';
import { href } from '../lib/router';

export function SimulatorPage({ id }: { id: string | undefined }) {
  const sim = getSimulator(id);

  if (!sim) {
    return (
      <div className="container">
        <section className="panel" style={{ marginTop: 8 }}>
          <div className="panel-head">
            <span className="panel-title">Unknown simulator</span>
          </div>
          <div className="panel-body">
            <p className="muted" style={{ marginBottom: 14 }}>
              <span className="mono">{id}</span> is not a live simulator. Pick one of these:
            </p>
            <div className="grid cards">
              {simulators.map((s) => (
                <DeviceCard key={s.meta.id} sim={s} />
              ))}
            </div>
            <p style={{ marginTop: 14 }}>
              <a href={href('/simulators')}>Browse the full catalog</a>
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="container">
      <Workspace key={sim.meta.id} sim={sim} />
    </div>
  );
}
