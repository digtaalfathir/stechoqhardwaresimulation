import type { AnySimulator } from '../simulators/registry';
import { NutrunnerSimulator } from '../simulators/nutrunner/nutrunner';
import { DigitalIoSimulator, type ChannelKind } from '../simulators/digital-io/digital-io';

/**
 * Device-specific panels.
 *
 * The generic workspace covers config / controls / state / events / payloads for
 * every device. This is the one escape hatch for devices that need a purpose-built
 * view — a tightening curve, a channel grid. Devices without one render nothing.
 */
export function DevicePanel({ sim }: { sim: AnySimulator }) {
  if (sim instanceof NutrunnerSimulator) return <NutrunnerPanel sim={sim} />;
  if (sim instanceof DigitalIoSimulator) return <DigitalIoPanel sim={sim} />;
  return null;
}

export function hasDevicePanel(sim: AnySimulator): boolean {
  return sim instanceof NutrunnerSimulator || sim instanceof DigitalIoSimulator;
}

// --- nutrunner -------------------------------------------------------------

function NutrunnerPanel({ sim }: { sim: NutrunnerSimulator }) {
  const { phase, torque, angle, curve } = sim.state;
  const unit = sim.cfg('torqueUnit');
  const target = sim.num('targetTorque');
  const tol = sim.num('tolerance') / 100;
  const scaleMax = Math.max(target * 1.6, torque * 1.05, 0.1);
  const pct = (v: number) => `${Math.min(100, (v / scaleMax) * 100)}%`;

  const resultNode = phase === 'NG' ? 'NG' : phase === 'ERROR' ? 'ERROR' : 'OK';
  const nodes = ['READY', 'TIGHTENING', resultNode];
  const currentIndex =
    phase === 'TIGHTENING' ? 1 : phase === 'OK' || phase === 'NG' || phase === 'ERROR' ? 2 : 0;
  const fillTone = phase === 'OK' ? 'ok' : phase === 'NG' || phase === 'ERROR' ? 'ng' : '';

  return (
    <section className="panel span-2">
      <div className="panel-head">
        <span className="panel-title">Tightening Sequence</span>
        <div className="spacer" />
        <span className="chip">target {target} {unit}</span>
        <span className="chip">± {sim.num('tolerance')}%</span>
      </div>
      <div className="panel-body">
        <div className="phase-chain">
          {nodes.map((node, i) => (
            <span key={node} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {i > 0 && <span className="phase-arrow">→</span>}
              <span
                className={[
                  'phase-node',
                  i < currentIndex ? 'done' : '',
                  i === currentIndex ? 'current' : '',
                  i === currentIndex && node === 'OK' ? 'ok' : '',
                  i === currentIndex && node === 'NG' ? 'ng' : '',
                  i === currentIndex && node === 'ERROR' ? 'err' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {node}
              </span>
            </span>
          ))}
        </div>

        <div className="readouts">
          <div className="readout">
            <span>Torque</span>
            <b>
              {torque.toFixed(1)} <small style={{ fontSize: 12, color: 'var(--ink-3)' }}>{unit}</small>
            </b>
          </div>
          <div className="readout">
            <span>Angle</span>
            <b>{angle}°</b>
          </div>
          <div className="readout">
            <span>Phase</span>
            <b className={phase === 'NG' || phase === 'ERROR' ? 't-error' : phase === 'OK' ? 't-ok' : ''}>
              {phase}
            </b>
          </div>
          <div className="readout">
            <span>Cycle</span>
            <b>{sim.state.cycle}</b>
          </div>
        </div>

        <div className="torque-track">
          <div
            className="torque-band"
            style={{ left: pct(target * (1 - tol)), width: pct(target * 2 * tol) }}
            title={`Accept window ${(target * (1 - tol)).toFixed(1)} – ${(target * (1 + tol)).toFixed(1)} ${unit}`}
          />
          <div className="torque-target" style={{ left: pct(target) }}>
            <span>target {target}</span>
          </div>
          <div className={`torque-fill ${fillTone}`} style={{ width: pct(torque) }} />
          {curve.length > 1 && (
            // The trace shares the bar's axis: it is compressed into the span
            // already reached, so it always ends exactly at the live bar edge.
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              aria-hidden="true"
            >
              <polyline
                points={curve
                  .map((v, i) => {
                    const span = Math.min(100, (torque / scaleMax) * 100);
                    const x = (i / (curve.length - 1)) * span;
                    return `${x},${100 - Math.min(100, (v / scaleMax) * 100)}`;
                  })
                  .join(' ')}
                fill="none"
                stroke="var(--ink-2)"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
                opacity="0.5"
              />
            </svg>
          )}
        </div>
        <div className="torque-scale">
          <span>0</span>
          <span>{(scaleMax / 2).toFixed(0)}</span>
          <span>
            {scaleMax.toFixed(0)} {unit}
          </span>
        </div>
      </div>
      <p className="panel-note">
        Green band is the accept window. The trace is the torque ramp of the current cycle; the bar
        edge is the live reading.
      </p>
    </section>
  );
}

// --- digital i/o -----------------------------------------------------------

function DigitalIoPanel({ sim }: { sim: DigitalIoSimulator }) {
  return (
    <section className="panel span-2">
      <div className="panel-head">
        <span className="panel-title">I/O Channels</span>
        <div className="spacer" />
        <span className="chip">click a channel to toggle it</span>
      </div>
      <div className="panel-body">
        <div className="io-columns">
          <ChannelBlock sim={sim} kind="DI" title="Inputs" channels={sim.state.inputs} />
          <ChannelBlock sim={sim} kind="DO" title="Outputs" channels={sim.state.outputs} />
        </div>
      </div>
      <p className="panel-note">
        Inputs model field signals (sensors, buttons); outputs model driven loads (valves, lamps).
        Every transition is logged and framed for the configured transport.
      </p>
    </section>
  );
}

function ChannelBlock({
  sim,
  kind,
  title,
  channels,
}: {
  sim: DigitalIoSimulator;
  kind: ChannelKind;
  title: string;
  channels: boolean[];
}) {
  const on = channels.filter(Boolean).length;
  return (
    <div>
      <div className="io-legend">
        <h4>{title}</h4>
        <span className="muted" style={{ fontSize: 12 }}>
          {on} of {channels.length} ON
        </span>
      </div>
      <div className="io-channels">
        {channels.map((value, i) => {
          const name = sim.channelName(kind, i);
          return (
            <button
              key={name}
              type="button"
              className={`io-channel${value ? ' on' : ''}`}
              onClick={() => sim.toggle(kind, i)}
              aria-pressed={value}
              title={`Toggle ${name}`}
            >
              <span className="led" />
              {name}
              <span className="io-value">{value ? 'ON' : 'OFF'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
