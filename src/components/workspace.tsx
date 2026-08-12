import { useState } from 'react';
import type { AnySimulator } from '../simulators/registry';
import { simulators } from '../simulators/registry';
import type { Config } from '../simulators/core/simulator';
import type { ConfigField, DeviceStatus, SimEvent, Tone } from '../simulators/core/types';
import { useSimulator } from '../lib/use-simulator';
import { href } from '../lib/router';
import { Icon } from './icon';
import { EventStream, PayloadInspector } from './event-stream';
import { DevicePanel } from './device-panels';

const STATUS_TONE: Record<DeviceStatus, Tone> = {
  OFFLINE: 'neutral',
  CONNECTED: 'ok',
  SIMULATING: 'active',
  ERROR: 'error',
};

/**
 * The workspace every device shares: status, configuration, controls, live
 * state, event stream, payload inspector and communication log. A new simulator
 * gets all of it for free by declaring config fields, actions and state rows.
 */
export function Workspace({ sim }: { sim: AnySimulator }) {
  useSimulator(sim);
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);

  // Follows the newest event until the user picks one to pin.
  const selected: SimEvent | null =
    sim.events.find((e) => e.seq === selectedSeq) ?? sim.events[0] ?? null;

  return (
    <>
      <header className="ws-head">
        <div style={{ minWidth: 0 }}>
          <h1>{sim.meta.name}</h1>
          <p className="muted" style={{ fontSize: 13 }}>
            {sim.meta.tagline}
          </p>
        </div>
        <div className="spacer" style={{ marginLeft: 'auto' }} />
        <div className="meta">
          {sim.meta.protocols.map((p) => (
            <span key={p} className="chip">
              {p}
            </span>
          ))}
          <span className={`status t-${STATUS_TONE[sim.status]}`}>
            <span className="dot" />
            {sim.status}
          </span>
        </div>
      </header>

      <nav className="device-switcher" aria-label="Switch device">
        {simulators.map((s) => (
          <a
            key={s.meta.id}
            className="device-tab"
            href={href(`/simulators/${s.meta.id}`)}
            aria-current={s.meta.id === sim.meta.id ? 'page' : undefined}
          >
            <span className={`mini-dot ${s.status === 'SIMULATING' ? 't-active' : ''}`} />
            {s.meta.name}
          </a>
        ))}
        <a className="device-tab" href={href('/simulators')}>
          <Icon name="grid" size={14} />
          All simulators
        </a>
      </nav>

      <ConfigPanel key={sim.meta.id} sim={sim} />

      <div className="ws-row controls-state">
        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">Device Controls</span>
          </div>
          <div className="panel-body controls">
            {sim.actions.map((a) => (
              <div className="control" key={a.id}>
                <button
                  type="button"
                  className={`btn ${a.tone === 'primary' ? 'btn-primary' : a.tone === 'danger' ? 'btn-danger' : ''}`}
                  onClick={() => sim.run(a.id)}
                >
                  <Icon name={a.tone === 'primary' ? 'bolt' : 'arrow'} size={14} />
                  {a.label}
                </button>
                {a.hint && <span className="hint">{a.hint}</span>}
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">Live Device State</span>
            <div className="spacer" />
            <span className="chip">{sim.events.length} events</span>
          </div>
          <table className="state-table">
            <tbody>
              {sim.stateRows().map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td className={`${row.mono ? 'mono ' : ''}${row.tone ? `t-${row.tone}` : ''}`}>
                    {row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <div className="ws-row">
        <DevicePanel sim={sim} />
      </div>

      <div className="ws-row stream-inspect">
        <EventStream
          events={sim.events}
          selectedSeq={selected?.seq ?? null}
          onSelect={setSelectedSeq}
          onClear={() => {
            sim.clearEvents();
            setSelectedSeq(null);
          }}
        />
        <PayloadInspector event={selected} fallback={sim.samplePayload()} />
      </div>

      <div className="ws-row">
        <CommunicationLog events={sim.events} />
      </div>
    </>
  );
}

/** Declarative config form — rendered from the simulator's field schema. */
function ConfigPanel({ sim }: { sim: AnySimulator }) {
  const [form, setForm] = useState<Config>(() => ({ ...sim.config }));
  const dirty = JSON.stringify(form) !== JSON.stringify(sim.config);

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <section className="panel" style={{ marginBottom: 12 }}>
      <div className="panel-head">
        <span className="panel-title">Device Configuration</span>
        <div className="spacer" />
        {dirty && <span className="chip t-warn">unapplied changes</span>}
      </div>
      <div className="panel-body">
        <div className="fields">
          {sim.configFields.map((f) => (
            <Field key={f.key} sim={sim} field={f} value={form[f.key]} onChange={set} />
          ))}
        </div>
        <div className="field-row-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => sim.applyConfig(form)}
            disabled={!dirty && sim.status !== 'OFFLINE'}
          >
            Apply Configuration
          </button>
          <button type="button" className="btn" onClick={() => setForm(sim.defaultConfig())}>
            Restore Defaults
          </button>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {sim.status === 'OFFLINE'
              ? 'Applying configuration brings the device online.'
              : 'Values are validated by the device before they take effect.'}
          </span>
        </div>
      </div>
    </section>
  );
}

function Field({
  sim,
  field,
  value,
  onChange,
}: {
  sim: AnySimulator;
  field: ConfigField;
  value: string | number | undefined;
  onChange: (key: string, value: string) => void;
}) {
  const id = `${sim.meta.id}-${field.key}`;
  const cls = field.mono ? 'mono-input' : undefined;
  const v = String(value ?? '');
  return (
    <div className={`field${field.type === 'textarea' ? ' wide' : ''}`}>
      <label htmlFor={id}>{field.label}</label>
      {field.type === 'select' ? (
        <select id={id} className={cls} value={v} onChange={(e) => onChange(field.key, e.target.value)}>
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : field.type === 'textarea' ? (
        <textarea id={id} className={cls} value={v} onChange={(e) => onChange(field.key, e.target.value)} />
      ) : (
        <input
          id={id}
          className={cls}
          type={field.type === 'number' ? 'number' : 'text'}
          inputMode={field.type === 'number' ? 'decimal' : undefined}
          min={field.min}
          max={field.max}
          step={field.step}
          value={v}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      )}
      {field.hint && <span className="hint">{field.hint}</span>}
    </div>
  );
}

/** Only the events that put something on the wire. */
function CommunicationLog({ events }: { events: SimEvent[] }) {
  const frames = events.filter((e) => e.transport).slice(0, 40);
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">Communication Log</span>
        <div className="spacer" />
        <span className="chip">{frames.length} frames</span>
      </div>
      {frames.length === 0 ? (
        <p className="empty">
          No traffic yet. Actions that would reach a backend appear here with their protocol.
        </p>
      ) : (
        <div className="scroll-x">
          <table className="def-table" style={{ border: 0, margin: 0 }}>
            <thead>
              <tr>
                <th style={{ width: 90 }}>Time</th>
                <th style={{ width: 120 }}>Protocol</th>
                <th style={{ width: 90 }}>Direction</th>
                <th>Frame</th>
              </tr>
            </thead>
            <tbody>
              {frames.map((e) => (
                <tr key={e.seq}>
                  <td className="mono">{e.timestamp.slice(11, 19)}</td>
                  <td className="mono">{e.transport!.protocol}</td>
                  <td className="mono muted">{e.transport!.direction}</td>
                  <td className="mono">{e.transport!.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="panel-note">
        Frames are generated, not sent — nothing leaves the browser. Select an event above to read
        the full frame.
      </p>
    </section>
  );
}
