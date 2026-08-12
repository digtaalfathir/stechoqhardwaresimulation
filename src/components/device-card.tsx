import type { PlannedSimulator } from '../simulators/core/types';
import type { AnySimulator } from '../simulators/registry';
import { href } from '../lib/router';
import { useT } from '../lib/i18n';
import { Icon } from './icon';

export function DeviceCard({ sim }: { sim: AnySimulator }) {
  const t = useT();
  return (
    <a className="card" href={href(`/simulators/${sim.meta.id}`)}>
      <div className="card-top">
        <span className="card-icon">
          <Icon name={sim.meta.icon} />
        </span>
        <div style={{ minWidth: 0 }}>
          <h3>{sim.meta.name}</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            {sim.meta.category}
          </span>
        </div>
      </div>
      <p>{t(`sim.${sim.meta.id}.tagline`, sim.meta.tagline)}</p>
      <div className="card-foot">
        {sim.meta.protocols.map((p) => (
          <span key={p} className="chip">
            {p}
          </span>
        ))}
        <span className="go">
          {t('card.open', 'Open')} <Icon name="arrow" size={13} />
        </span>
      </div>
    </a>
  );
}

export function PlannedCard({ device }: { device: PlannedSimulator }) {
  const t = useT();
  return (
    <div className="card locked">
      <div className="card-top">
        <span className="card-icon">
          <Icon name={device.icon} />
        </span>
        <div style={{ minWidth: 0 }}>
          <h3>{device.name}</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            {device.category}
          </span>
        </div>
      </div>
      <p>{t(`sim.${device.id}.tagline`, device.tagline)}</p>
      <div className="card-foot">
        <span className="chip">
          <Icon name="lock" size={11} /> {t('card.planned', 'planned')}
        </span>
      </div>
    </div>
  );
}
