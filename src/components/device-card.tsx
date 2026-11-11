import type { PlannedSimulator } from '../simulators/core/types';
import type { AnySimulator } from '../simulators/registry';
import { href } from '../lib/router';
import { useT, type Translate } from '../lib/i18n';
import { DeviceArt } from './device-art';
import { Icon } from './icon';

/** How a device's traffic leaves the browser — the honest answer, per device. */
export type Reach = 'sent' | 'bridge' | 'generated' | 'mixed';

export const REACH: Record<string, Reach> = {
  'rfid-handheld': 'sent',
  'rfid-reader': 'sent',
  nutrunner: 'generated',
  'digital-io': 'mixed',
  plc: 'bridge',
};

export const reachLabel = (r: Reach, t: Translate) =>
  ({
    sent: t('reach.sent', 'Really sent'),
    bridge: t('reach.bridge', 'Local bridge'),
    generated: t('reach.generated', 'Generated'),
    mixed: t('reach.mixed', 'REST sent · frames generated'),
  })[r];

/** Three things you can do with each device, shown on its card. */
export const highlights = (id: string, t: Translate): string[] =>
  ({
    'rfid-handheld': [
      t('hl.hh.1', 'The WMS RFID Suite app on an MC3300, screen for screen'),
      t('hl.hh.2', 'Hold the yellow key to scan, release to post'),
      t('hl.hh.3', 'Tags read by distance and power; real POST to your API'),
    ],
    'rfid-reader': [
      t('hl.gt.1', '8-antenna portal; a forklift drives up to 18 RR through'),
      t('hl.gt.2', 'Reports every 7, 3 or 1 s — only what was caught'),
      t('hl.gt.3', 'A real POST per report; deduplication is yours'),
    ],
    nutrunner: [
      t('hl.nr.1', 'CVI3-style controller with torque and angle on screen'),
      t('hl.nr.2', 'Hold the trigger; let go early for an NG'),
      t('hl.nr.3', 'Live torque curve and MID 0061 split field by field'),
    ],
    'digital-io': [
      t('hl.io.1', 'ESP32 + W5500 box wired to sensors and actuators'),
      t('hl.io.2', '4, 8 or 16 channels; push buttons act while held'),
      t('hl.io.3', 'Modbus process image and every frame, byte by byte'),
    ],
    plc: [
      t('hl.pl.1', 'Q-series rack with a live device monitor'),
      t('hl.pl.2', 'One-click local bridge: your program connects for real'),
      t('hl.pl.3', 'Every MC 3E frame decoded as it arrives'),
    ],
  })[id] ?? [];

export function DeviceCard({ sim, compact = false }: { sim: AnySimulator; compact?: boolean }) {
  const t = useT();
  const reach = REACH[sim.meta.id] ?? 'generated';
  return (
    <a className={`dcard${compact ? ' compact' : ''}`} href={href(`/simulators/${sim.meta.id}`)}>
      <div className="dcard-stage">
        <DeviceArt id={sim.meta.id} />
        <span className={`reach reach-${reach}`}>{reachLabel(reach, t)}</span>
      </div>
      <div className="dcard-body">
        <span className="dcard-cat">{sim.meta.category}</span>
        <h3>{sim.meta.name}</h3>
        <p>{t(`sim.${sim.meta.id}.tagline`, sim.meta.tagline)}</p>
        {!compact && (
          <ul className="dcard-points">
            {highlights(sim.meta.id, t).map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        )}
        <div className="dcard-foot">
          {sim.meta.protocols.map((p) => (
            <span key={p} className="chip">
              {p}
            </span>
          ))}
          <span className="go">
            {t('card.open', 'Open')} <Icon name="arrow" size={13} />
          </span>
        </div>
      </div>
    </a>
  );
}

/**
 * A planned device is one line of intent, not a product: a quiet card with its
 * icon where the illustration will be.
 */
export function PlannedRow({ device }: { device: PlannedSimulator }) {
  const t = useT();
  return (
    <div className="planned-row">
      <span className="planned-icon">
        <Icon name={device.icon} size={18} />
      </span>
      <div className="planned-text">
        <b>{device.name}</b>
        <span>{t(`sim.${device.id}.tagline`, device.tagline)}</span>
      </div>
      <span className="chip">
        <Icon name="lock" size={11} /> {t('card.planned', 'planned')}
      </span>
    </div>
  );
}
