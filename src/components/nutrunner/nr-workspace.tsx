import { useEffect, useState } from 'react';
import type { NutrunnerSimulator } from '../../simulators/nutrunner/nutrunner';
import { MID_0061_FIELDS, NUL } from '../../simulators/nutrunner/open-protocol';
import type { SimEvent } from '../../simulators/core/types';
import { useSimulator } from '../../lib/use-simulator';
import { useT } from '../../lib/i18n';
import { EventStream, PayloadInspector } from '../event-stream';
import { CommunicationLog, ConfigPanel } from '../workspace';
import { NrStation } from './nr-station';
import './nr.css';

/**
 * The nutrunner workspace: a tightening station beside its live torque curve,
 * then the results the controller reported and the last MID 0061 taken apart.
 * The Open Protocol telegrams are generated for inspection, not sent.
 */
export function NutrunnerWorkspace({ sim }: { sim: NutrunnerSimulator }) {
  useSimulator(sim);
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const selected: SimEvent | null = sim.events.find((e) => e.seq === selectedSeq) ?? sim.events[0] ?? null;

  // The controller is on as soon as the station is opened.
  useEffect(() => {
    if (sim.status === 'OFFLINE') sim.applyConfig({});
  }, [sim]);

  return (
    <>
      <StatusBar sim={sim} />
      <div className="nr-top">
        <NrStation sim={sim} />
        <Curve sim={sim} />
      </div>
      <div className="nr-lower">
        <Results sim={sim} />
        <Telegram sim={sim} />
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

function StatusBar({ sim }: { sim: NutrunnerSimulator }) {
  const t = useT();
  const [settings, setSettings] = useState(false);
  const unit = sim.cfg('torqueUnit');
  const online = sim.status !== 'OFFLINE';
  return (
    <>
      <section className="panel nr-status">
        <span className={`nr-dot${sim.status === 'ERROR' ? ' err' : online ? ' on' : ''}`} />
        <span className="nr-kv">
          <span className="muted">{t('nr.controller', 'Controller')}</span>{' '}
          <b>
            {sim.cfg('controllerName')} · {sim.cfg('ip')}:{sim.num('port')}
          </b>
        </span>
        <span className="nr-kv">
          <span className="muted">Session</span> <b>{sim.session() === 'SUBSCRIBED' ? 'subscribed MID 0061' : 'closed'}</b>
        </span>
        <span className="spacer" />
        <span className="nr-kv">
          <span className="muted">Pset</span>{' '}
          <b>
            {sim.num('psetId')} · {sim.num('targetTorque')} {unit} ±{sim.num('tolerance')}% · {sim.num('targetAngle')}° ±
            {sim.num('angleTolerance')}%
          </b>
        </span>
        {sim.cfg('vin') && (
          <span className="nr-kv">
            <span className="muted">VIN</span> <b>{sim.cfg('vin')}</b>
          </span>
        )}
        <span className="chip">{t('nr.generated', 'telegrams generated, not sent')}</span>
        <button type="button" className="btn btn-sm" aria-expanded={settings} onClick={() => setSettings((v) => !v)}>
          ⚙ {t('nr.settings', 'Settings')}
        </button>
      </section>
      {settings && <ConfigPanel key={sim.meta.id} sim={sim} />}
    </>
  );
}

/** Torque over angle, live while the trigger is held, with the acceptance window. */
function Curve({ sim }: { sim: NutrunnerSimulator }) {
  const t = useT();
  const st = sim.state;
  const unit = sim.cfg('torqueUnit');
  const tq = sim.torqueLimits();
  const an = sim.angleLimits();
  const W = 460;
  const H = 260;
  const pad = { l: 44, r: 16, t: 16, b: 28 };
  const xMax = Math.max(an.max * 1.25, ...st.points.map((p) => p[0]), ...st.prevPoints.map((p) => p[0])) || 1;
  const yMax = Math.max(tq.max * 1.25, ...st.points.map((p) => p[1]), ...st.prevPoints.map((p) => p[1])) || 1;
  const x = (a: number) => pad.l + (a / xMax) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / yMax) * (H - pad.t - pad.b);
  const path = (pts: [number, number][]) => pts.map((p, i) => `${i ? 'L' : 'M'} ${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(' ');
  const last = st.points[st.points.length - 1];
  const verdict = st.phase === 'TIGHTENING' ? 'RUN' : st.phase === 'OK' || st.phase === 'NG' ? st.phase : st.phase === 'ERROR' ? 'ALARM' : '—';
  const lim = (s: string | null) => (s === 'OK' ? 'ok' : s ? 'ng' : '');

  return (
    <section className="panel nr-curve">
      <div className="panel-head">
        <span className="panel-title">{t('nr.curve', 'Tightening Curve')}</span>
        <span className="chip">{t('nr.curve.axes', 'torque × angle')}</span>
        <span className="spacer" />
        {st.tighteningId > 0 && <span className={`chip ${st.lastResult === 'OK' ? 't-ok' : 't-error'}`}>{st.lastResult} · ID {st.tighteningId}</span>}
      </div>
      <div className="nr-chart">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Torque over angle">
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <line key={f} x1={pad.l} x2={W - pad.r} y1={y(yMax * f)} y2={y(yMax * f)} className="nr-grid" />
          ))}
          <line x1={pad.l} x2={pad.l} y1={pad.t} y2={H - pad.b} className="nr-axis" />
          <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} className="nr-axis" />
          <rect x={x(an.min)} y={y(tq.max)} width={x(an.max) - x(an.min)} height={y(tq.min) - y(tq.max)} className="nr-window" />
          <text x={x(an.min)} y={y(tq.max) - 5} className="nr-svg-text ok">
            window
          </text>
          {st.prevPoints.length > 1 && (
            <path d={path(st.prevPoints)} className={`nr-prev ${st.prevResult === 'NG' ? 'ng' : ''}`} />
          )}
          {st.points.length > 1 && <path d={path(st.points)} className="nr-line" />}
          {last && st.points.length > 1 && (
            <circle cx={x(last[0])} cy={y(last[1])} r={5} className={`nr-dotpt ${st.phase === 'NG' ? 'ng' : st.phase === 'OK' ? 'ok' : ''}`} />
          )}
          <text x={pad.l - 6} y={y(tq.target) + 3} className="nr-svg-text" textAnchor="end">
            {tq.target}
          </text>
          <text x={pad.l - 6} y={H - pad.b + 3} className="nr-svg-text" textAnchor="end">
            0
          </text>
          <text x={pad.l - 6} y={pad.t + 4} className="nr-svg-text" textAnchor="end">
            {unit}
          </text>
          <text x={x(an.target)} y={H - 10} className="nr-svg-text" textAnchor="middle">
            {an.target}°
          </text>
          <text x={W - pad.r} y={H - 10} className="nr-svg-text" textAnchor="end">
            angle
          </text>
        </svg>
      </div>
      <div className="nr-readout">
        <div className={`nr-ro ${lim(st.torqueStatus)}`}>
          <small>Torque</small>
          <b>
            {st.torque.toFixed(2)} <span>{unit}</span>
          </b>
          <span className="mono">
            {tq.min} – {tq.max} {st.torqueStatus ? `· ${st.torqueStatus}` : ''}
          </span>
        </div>
        <div className={`nr-ro ${lim(st.angleStatus)}`}>
          <small>Angle</small>
          <b>
            {st.angle} <span>°</span>
          </b>
          <span className="mono">
            {an.min} – {an.max} {st.angleStatus ? `· ${st.angleStatus}` : ''}
          </span>
        </div>
        <div className={`nr-ro verdict ${st.phase === 'OK' ? 'ok' : st.phase === 'NG' || st.phase === 'ERROR' ? 'ng' : st.phase === 'TIGHTENING' ? 'run' : ''}`}>
          <b>{verdict}</b>
        </div>
      </div>
    </section>
  );
}

function Results({ sim }: { sim: NutrunnerSimulator }) {
  const t = useT();
  const rows = sim.events.filter((e) => e.name === 'TIGHTENING_RESULT').slice(0, 10);
  const unit = sim.cfg('torqueUnit');
  const mark = (s: unknown) => (s === 'LOW' ? 'lo' : s === 'HIGH' ? 'hi' : '');
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t('nr.results', 'Tightening Results')}</span>
        <span className="chip">MID 0061</span>
        <span className="spacer" />
        <span className="chip t-ok">{sim.state.okCount} OK</span>
        <span className={`chip${sim.state.ngCount ? ' t-error' : ''}`}>{sim.state.ngCount} NG</span>
      </div>
      {rows.length === 0 ? (
        <p className="empty">{t('nr.results.empty', 'No fastening yet. Hold the trigger (or Space) to tighten the first bolt.')}</p>
      ) : (
        <div className="scroll-x">
          <table className="nr-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{t('nr.time', 'Time')}</th>
                <th>Pset</th>
                <th>Batch</th>
                <th>
                  {t('nr.torque', 'Torque')} {unit}
                </th>
                <th>{t('nr.angle', 'Angle')} °</th>
                <th>{t('nr.result', 'Result')}</th>
                <th>Open Protocol</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => {
                const p = e.payload as Record<string, unknown>;
                const ok = p.tightening_status === 'OK';
                return (
                  <tr key={e.seq} className={i === 0 ? (ok ? 'last ok' : 'last ng') : ''}>
                    <td>{String(p.tightening_id).padStart(6, '0')}</td>
                    <td>{new Date(e.timestamp).toLocaleTimeString([], { hour12: false })}</td>
                    <td>{String(p.pset_id)}</td>
                    <td>{Number(p.batch_size) > 0 ? `${p.batch_counter}/${p.batch_size}` : '—'}</td>
                    <td className={mark(p.torque_status)}>
                      {Number(p.torque).toFixed(2)} {p.torque_status !== 'OK' ? String(p.torque_status) : ''}
                    </td>
                    <td className={mark(p.angle_status)}>
                      {String(p.angle)} {p.angle_status !== 'OK' ? String(p.angle_status) : ''}
                    </td>
                    <td className={ok ? 'res ok' : 'res ng'}>{ok ? 'OK' : 'NG'}</td>
                    <td className="muted">0061 · ack 0062</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Which colour each MID 0061 field gets: identity, ids, status, torque, angle, the rest. */
const FIELD_KIND: Record<string, number> = {
  '01': 2, '02': 2, '03': 3, '04': 3, '05': 2, '06': 2, '07': 6, '08': 6,
  '09': 4, '10': 4, '11': 4, '12': 5, '13': 5, '14': 5, '15': 5,
  '16': 3, '17': 3, '18': 3, '19': 3, '20': 6, '21': 6, '22': 4, '23': 2,
};

/** The last MID 0061, cut at its real byte positions and explained field by field. */
function Telegram({ sim }: { sim: NutrunnerSimulator }) {
  const t = useT();
  const raw = sim.state.lastTelegram;
  if (!raw) {
    return (
      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">{t('nr.telegram', 'Telegram MID 0061')}</span>
        </div>
        <p className="empty">{t('nr.telegram.empty', 'The first result telegram appears here, byte by byte.')}</p>
      </section>
    );
  }
  const payload = raw.endsWith(NUL) ? raw.slice(0, -1) : raw;
  const parts: { text: string; kind: number; no?: string; label?: string; value?: string }[] = [
    { text: payload.slice(0, 4), kind: 1, label: 'Length', value: `${Number(payload.slice(0, 4))} (+ NUL)` },
    { text: payload.slice(4, 8), kind: 1, label: 'MID', value: '0061 · last tightening result' },
    { text: payload.slice(8, 11), kind: 1, label: 'Revision', value: payload.slice(8, 11) },
    { text: payload.slice(11, 20), kind: 6, label: 'No ack · station · spindle · spare', value: payload.slice(11, 16) },
  ];
  let at = 20;
  for (const f of MID_0061_FIELDS) {
    const chunk = payload.slice(at, at + 2 + f.width);
    const value = chunk.slice(2);
    parts.push({ text: chunk, kind: FIELD_KIND[f.no] ?? 6, no: f.no, label: f.label, value: f.decode ? `${value.trim()} → ${f.decode(value)}` : value.trim() || '(empty)' });
    at += 2 + f.width;
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t('nr.telegram', 'Telegram MID 0061')}</span>
        <span className="spacer" />
        <span className="chip t-active">rev 1 · {payload.length} + NUL</span>
      </div>
      <div className="nr-tele">
        <div className="nr-bytes">
          {parts.map((p, i) => (
            <span key={i} className={`nr-k${p.kind}`} title={p.label}>
              {p.text.replace(/ /g, '·')}
            </span>
          ))}
        </div>
        <dl className="nr-fields">
          {parts.map((p, i) => (
            <div key={i}>
              <dt>
                <i className={`nr-k${p.kind}`} />
                {p.no ?? '—'} {p.label}
              </dt>
              <dd>{p.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
