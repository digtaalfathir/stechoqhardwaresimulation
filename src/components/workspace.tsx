import { useEffect, useRef, useState } from 'react';
import type { AnySimulator } from '../simulators/registry';
import { simulators } from '../simulators/registry';
import type { Config } from '../simulators/core/simulator';
import type { ConfigField, DeviceStatus, SimEvent, Tone } from '../simulators/core/types';
import { useSimulator } from '../lib/use-simulator';
import { href } from '../lib/router';
import { useT, type Translate } from '../lib/i18n';
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
  const t = useT();
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);

  // Follows the newest event until the user picks one to pin.
  const selected: SimEvent | null =
    sim.events.find((e) => e.seq === selectedSeq) ?? sim.events[0] ?? null;

  // A device whose values are all shown elsewhere returns no rows; then the
  // controls take the full width instead of leaving a hole beside them.
  const rows = sim.stateRows();

  return (
    <>
      <header className="ws-head">
        <div style={{ minWidth: 0 }}>
          <h1>{sim.meta.name}</h1>
          <p className="muted" style={{ fontSize: 13 }}>
            {t(`sim.${sim.meta.id}.tagline`, sim.meta.tagline)}
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

      <nav className="device-switcher" aria-label={t('ws.switch', 'Switch device')}>
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
          {t('ws.all', 'All simulators')}
        </a>
      </nav>

      <ConfigPanel key={sim.meta.id} sim={sim} />

      <div className={`ws-row${rows.length ? ' controls-state' : ''}`}>
        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">{t('ws.controls', 'Device Controls')}</span>
            {!rows.length && (
              <>
                <div className="spacer" />
                <span className={`status t-${STATUS_TONE[sim.status]}`}>
                  <span className="dot" />
                  {sim.status}
                </span>
                <span className="chip">
                  {sim.events.length} {t('unit.events', 'events')}
                </span>
              </>
            )}
          </div>
          <div className={`panel-body controls${rows.length ? '' : ' controls-row'}`}>
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

        {rows.length > 0 && (
          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">{t('ws.state', 'Live Device State')}</span>
              <div className="spacer" />
              <span className="chip">
                {sim.events.length} {t('unit.events', 'events')}
              </span>
            </div>
            <table className="state-table">
              <tbody>
                {rows.map((row) => (
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
        )}
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
        <CommunicationLog events={sim.events} t={t} />
      </div>
    </>
  );
}

/** Declarative config form — rendered from the simulator's field schema. */
function ConfigPanel({ sim }: { sim: AnySimulator }) {
  const t = useT();
  const [form, setForm] = useState<Config>(() => ({ ...sim.config }));
  const dirty = JSON.stringify(form) !== JSON.stringify(sim.config);

  const set = (key: string, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <section className="panel" style={{ marginBottom: 12 }}>
      <div className="panel-head">
        <span className="panel-title">{t('ws.config', 'Device Configuration')}</span>
        <div className="spacer" />
        {dirty && <span className="chip t-warn">{t('ws.config.dirty', 'unapplied changes')}</span>}
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
            {t('ws.config.apply', 'Apply Configuration')}
          </button>
          <button type="button" className="btn" onClick={() => setForm(sim.defaultConfig())}>
            {t('ws.config.defaults', 'Restore Defaults')}
          </button>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {sim.status === 'OFFLINE'
              ? t('ws.config.offline', 'Applying configuration brings the device online.')
              : t('ws.config.online', 'Values are validated by the device before they take effect.')}
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
  value: string | number | boolean | undefined;
  onChange: (key: string, value: string | boolean) => void;
}) {
  const t = useT();
  const id = `${sim.meta.id}-${field.key}`;
  const cls = field.mono ? 'mono-input' : undefined;
  const v = typeof value === 'boolean' ? '' : String(value ?? '');
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
      ) : field.type === 'combo' ? (
        <ComboInput
          id={id}
          className={cls}
          value={v}
          options={field.options ?? []}
          placeholder={field.placeholder}
          onChange={(next) => onChange(field.key, next)}
        />
      ) : field.type === 'switch' ? (
        <div className="segmented" role="group" aria-label={field.label}>
          {field.options?.map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={v === o}
              onClick={() => onChange(field.key, o)}
            >
              {o}
            </button>
          ))}
        </div>
      ) : field.type === 'checkbox' ? (
        <label className="checkfield">
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(field.key, e.target.checked)}
          />
          {value === true ? t('field.on', 'Enabled') : t('field.off', 'Disabled')}
        </label>
      ) : field.type === 'textarea' ? (
        <textarea id={id} className={cls} value={v} onChange={(e) => onChange(field.key, e.target.value)} />
      ) : field.readonly ? (
        <input id={id} className={`${cls ?? ''} readonly-input`.trim()} value={v} readOnly tabIndex={-1} />
      ) : (
        <input
          id={id}
          className={cls}
          type={field.type === 'number' ? 'number' : 'text'}
          inputMode={field.type === 'number' ? 'decimal' : undefined}
          min={field.min}
          max={field.max}
          step={field.step}
          placeholder={field.placeholder}
          value={v}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      )}
      {field.hint && <span className="hint">{field.hint}</span>}
    </div>
  );
}

/** Only the events that put something on the wire. */
function CommunicationLog({ events, t }: { events: SimEvent[]; t: Translate }) {
  const frames = events.filter((e) => e.transport).slice(0, 40);
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t('ws.comm', 'Communication Log')}</span>
        <div className="spacer" />
        <span className="chip">
          {frames.length} {t('unit.frames', 'frames')}
        </span>
      </div>
      {frames.length === 0 ? (
        <p className="empty">
          {t(
            'ws.comm.empty',
            'No traffic yet. Actions that would reach a backend appear here with their protocol.',
          )}
        </p>
      ) : (
        <div className="scroll-x">
          <table className="def-table" style={{ border: 0, margin: 0 }}>
            <thead>
              <tr>
                <th style={{ width: 90 }}>{t('ws.comm.time', 'Time')}</th>
                <th style={{ width: 120 }}>{t('ws.comm.protocol', 'Protocol')}</th>
                <th style={{ width: 90 }}>{t('ws.comm.direction', 'Direction')}</th>
                <th>{t('ws.comm.frame', 'Frame')}</th>
                <th style={{ width: 150 }}>{t('ws.comm.result', 'Result')}</th>
              </tr>
            </thead>
            <tbody>
              {frames.map((e) => (
                <tr key={e.seq}>
                  <td className="mono">{e.timestamp.slice(11, 19)}</td>
                  <td className="mono">{e.transport!.protocol}</td>
                  <td className="mono muted">{e.transport!.direction}</td>
                  <td className="mono">{e.transport!.summary}</td>
                  <td className="mono">
                    {e.transport!.response ? (
                      e.transport!.response.ok ? (
                        <span className="t-ok">
                          {e.transport!.response.status} {e.transport!.response.statusText}
                        </span>
                      ) : (
                        <span className="t-error">
                          {e.transport!.response.status || t('ws.comm.blocked', 'blocked')}
                        </span>
                      )
                    ) : (
                      <span className="muted">{t('ws.comm.generated', 'generated')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="panel-note">
        {t(
          'ws.comm.note',
          'REST requests are really sent to the endpoint you configured; TCP, Modbus and MQTT frames are generated for inspection only. Select an event above to read the full frame.',
        )}
      </p>
    </section>
  );
}

/**
 * Type anything, or pick from the known list.
 *
 * The native `<input list>` hides its options behind a barely-visible affordance,
 * so the list gets an explicit toggle — the values are the point.
 */
function ComboInput({
  id,
  value,
  options,
  className,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  options: string[];
  className?: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="combo" ref={root}>
      <input
        id={id}
        className={className}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
      {options.length > 0 && (
        <button
          type="button"
          className="combo-toggle"
          aria-label={t('combo.options', 'Show options')}
          aria-expanded={open}
          tabIndex={-1}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name="caret" size={14} />
        </button>
      )}
      {open && (
        <ul className="combo-list" role="listbox">
          {options.map((o) => (
            <li key={o}>
              <button
                type="button"
                role="option"
                aria-selected={o === value}
                onClick={() => {
                  onChange(o);
                  setOpen(false);
                }}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
