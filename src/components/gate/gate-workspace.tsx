import { useEffect, useState } from 'react';
import { LOAD_SIZE, type GateSweep, type RfidReaderSimulator } from '../../simulators/rfid/rfid-reader';
import type { SimEvent } from '../../simulators/core/types';
import { useSimulator } from '../../lib/use-simulator';
import { useT } from '../../lib/i18n';
import { EventStream, PayloadInspector } from '../event-stream';
import { SendResult } from '../device-panels';
import { CommunicationLog, ConfigPanel } from '../workspace';
import { GateScene } from './gate-scene';
import './gate.css';

const INTERVALS = [3000, 7000, 15000];

/**
 * The gate workspace: the portal and the forklift going through it, the
 * reports as a timeline, the load the next forklift carries, and the
 * engineer's view of what went over the wire.
 */
export function GateWorkspace({ sim }: { sim: RfidReaderSimulator }) {
  useSimulator(sim);
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const selected: SimEvent | null = sim.events.find((e) => e.seq === selectedSeq) ?? sim.events[0] ?? null;

  // A gate is always on at the door: online as soon as it is opened.
  useEffect(() => {
    if (sim.status === 'OFFLINE') sim.applyConfig({});
  }, [sim]);

  return (
    <>
      {/* Re-read when the HUD changes the interval, so the form never shows a stale value. */}
      <ConfigPanel key={`${sim.meta.id}:${sim.num('interval')}`} sim={sim} />
      <div className="gt-layout">
        <div className="gt-main">
          <Stage sim={sim} />
          <Timeline sim={sim} />
        </div>
        <div className="gt-side">
          <LoadPanel sim={sim} />
          <SendResult sim={sim} />
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
      </div>
      <div className="ws-row">
        <CommunicationLog events={sim.events} />
      </div>
    </>
  );
}

/** Re-renders on a timer while something is counting down. */
function useClock(active: boolean, ms = 200) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return Date.now();
}

function Stage({ sim }: { sim: RfidReaderSimulator }) {
  const t = useT();
  const st = sim.state;
  const pass = st.pass;
  const now = useClock(pass !== null);
  const interval = Math.max(500, sim.num('interval'));

  const nextAt = pass && st.sweep < pass.sweepsPlanned ? pass.enterAt + st.sweep * interval : null;
  const phase = !pass
    ? t('gt.phase.ready', 'waiting at the gate')
    : now < pass.enterAt
      ? t('gt.phase.enter', 'driving in')
      : now <= pass.leaveAt + 300
        ? t('gt.phase.in', 'inside the gate')
        : t('gt.phase.out', 'driving off');
  const progress = pass ? Math.min(1, Math.max(0, (now - pass.startedAt) / (pass.endAt - pass.startedAt))) : 0;
  const total = pass ? pass.epcs.length : sim.tags().length;
  // Between passes the card is about the next load: nothing reported yet.
  const covered = pass ? st.covered : 0;
  const reportedOnly = pass ? st.reported.filter((e) => !st.readNow.includes(e)).length : 0;
  const nowCount = pass ? st.readNow.length : 0;

  return (
    <section className="panel gt-stage">
      <GateScene sim={sim} />

      <div className="gt-hud">
        {pass ? (
          <button type="button" className="btn btn-danger" onClick={() => sim.run('stop-pass')}>
            ■ {t('gt.stop', 'Stop')}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => sim.run('pass')} disabled={total === 0}>
            ▸ {t('gt.pass', 'Drive forklift through')}
          </button>
        )}
        <div className="segmented gt-seg" role="group" aria-label={t('gt.interval', 'Report interval')}>
          {INTERVALS.map((ms) => (
            <button
              key={ms}
              type="button"
              aria-pressed={interval === ms}
              disabled={pass !== null}
              onClick={() => sim.applyConfig({ interval: ms })}
            >
              {ms / 1000} s
            </button>
          ))}
        </div>
        {nextAt && (
          <span className="gt-card gt-countdown">
            {t('gt.next', 'next report in')} <b className="mono">{Math.max(0, (nextAt - now) / 1000).toFixed(1)} s</b>
          </span>
        )}
      </div>

      <div className="gt-card gt-api">
        <div className="gt-api-head">
          <span className="gt-srv">⇅</span>
          <b>WMS API</b>
          <span className="spacer" />
          <span className="mono muted">{st.sweeps.length ? `${st.sweeps.length} ${t('gt.reports', 'report(s)')}` : t('gt.api.idle', 'no report yet')}</span>
        </div>
        <ul>
          {st.sweeps.slice(0, 4).map((s) => (
            <li key={`${s.pass}-${s.n}`}>
              <span>
                #{s.n} · {s.fresh.length + s.again.length} tag · {s.at.slice(11, 19)}
              </span>
              <SweepResult s={s} />
            </li>
          ))}
        </ul>
      </div>

      <div className="gt-card gt-pass">
        <div className="gt-pass-head">
          <b>
            {pass ? `Pass #${pass.n}` : t('gt.nextload', 'Next load')} · {total} RR
          </b>
          <span className={`chip${pass ? ' t-active' : ''}`}>{phase}</span>
        </div>
        <div className="gt-track">
          <i className="rep" style={{ width: `${(reportedOnly / Math.max(1, total)) * 100}%` }} />
          <i className="now" style={{ width: `${(nowCount / Math.max(1, total)) * 100}%` }} />
        </div>
        <div className="gt-pass-row">
          <span>
            <b className="t-ok">{covered}</b> {t('gt.reported', 'reported')} · <b className="t-active">{nowCount}</b>{' '}
            {t('gt.now', 'in this report')} · {Math.max(0, total - covered)} {t('gt.waiting', 'not yet')}
          </span>
          <b className="mono">
            {covered}/{total}
          </b>
        </div>
        <div className="gt-route">
          <span>{t('gt.route.in', 'in')}</span>
          <span>{t('gt.route.gate', 'gate')}</span>
          <span>{t('gt.route.out', 'out')}</span>
          <b style={{ left: `${progress * 100}%` }} />
        </div>
      </div>

      <div className="gt-card gt-legend">
        <span>
          <i className="rep" />
          {t('gt.legend.rep', 'reported')}
        </span>
        <span>
          <i className="now" />
          {t('gt.legend.now', 'read in this report')}
        </span>
        <span>
          <i className="wait" />
          {t('gt.legend.wait', 'not yet')}
        </span>
      </div>
    </section>
  );
}

function SweepResult({ s }: { s: GateSweep }) {
  if (s.ok === null) return <b className="t-active">…</b>;
  return (
    <b className={s.ok ? 't-ok' : 't-error'}>
      {s.status || '—'} · {s.durationMs}ms
    </b>
  );
}

function Timeline({ sim }: { sim: RfidReaderSimulator }) {
  const t = useT();
  const st = sim.state;
  const sweeps = [...st.sweeps].reverse();
  const pass = st.pass;
  const left = pass ? pass.sweepsPlanned - st.sweep : 0;
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t('gt.timeline', 'Report Timeline')}</span>
        {sweeps.length > 0 && <span className="chip">pass #{sweeps[0].pass}</span>}
        <div className="spacer" />
        <span className="chip t-ok">
          {sim.transmission.delivered} {t('send.delivered', 'delivered')}
        </span>
        {sim.transmission.failed > 0 && (
          <span className="chip t-error">
            {sim.transmission.failed} {t('send.failed', 'failed')}
          </span>
        )}
      </div>
      {sweeps.length === 0 ? (
        <p className="empty">
          {t(
            'gt.timeline.empty',
            'No report yet. Drive the forklift through: every interval the gate posts what its antennas caught — in parts, with repeats.',
          )}
        </p>
      ) : (
        <div className="gt-timeline">
          {sweeps.map((s) => (
            <div key={`${s.pass}-${s.n}`} className={`gt-sweep${s === st.sweeps[0] && pass ? ' latest' : ''}`}>
              <h4>
                {t('gt.report', 'Report')} {s.n} <span className="mono">{s.at.slice(11, 19)}</span>
              </h4>
              <div className="gt-mix">
                {s.fresh.length > 0 && (
                  <span className="pill new">
                    {s.fresh.length} {t('gt.new', 'new')}
                  </span>
                )}
                {s.again.length > 0 && (
                  <span className="pill again">
                    {s.again.length} {t('gt.again', 'again')}
                  </span>
                )}
              </div>
              <div className="gt-epcs">
                {s.fresh.map((e) => (
                  <b key={e} className="n" title={e}>
                    …{e.slice(-4)}
                  </b>
                ))}
                {s.again.map((e) => (
                  <b key={e} className="a" title={e}>
                    …{e.slice(-4)}
                  </b>
                ))}
              </div>
              <div className={`gt-res${s.ok === false ? ' bad' : ''}`}>
                POST → {s.ok === null ? t('gt.sending', 'sending…') : `${s.status || t('gt.noresponse', 'no response')} · ${s.durationMs} ms`}
              </div>
              <div className="gt-cov">
                {s.covered} / {s.total} {t('gt.reported', 'reported')}
              </div>
            </div>
          ))}
          {left > 0 && (
            <div className="gt-sweep next">
              {t('gt.report', 'Report')} {st.sweep + 1}
              <br />
              <span className="mono">{t('gt.coming', 'coming')}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * What the next forklift carries. Editing during a pass loads the next one:
 * the forklift in the gate already set off with its stack.
 */
function LoadPanel({ sim }: { sim: RfidReaderSimulator }) {
  const t = useT();
  const count = sim.tags().length;
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t('gt.load', 'Forklift Load')}</span>
        <span className={`chip${count > LOAD_SIZE ? ' t-warn' : ''}`}>{count} RR</span>
        <div className="spacer" />
        <button type="button" className="btn btn-sm" onClick={() => sim.randomLoad()}>
          {t('gt.random', 'Random')} {LOAD_SIZE}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => sim.setTagsText('')} disabled={!count}>
          {t('gt.clear', 'Clear')}
        </button>
      </div>
      <div className="panel-body">
        <textarea
          className="mono-input gt-load"
          spellCheck={false}
          aria-label={t('gt.load.label', 'EPCs on the forklift, one per line')}
          value={sim.state.tagsText}
          placeholder="E280689400004025A987A05A"
          onChange={(e) => sim.setTagsText(e.target.value)}
        />
      </div>
      <p className="panel-note">
        {sim.state.pass
          ? t('gt.load.next', 'The forklift in the gate already set off with its stack; changes here load the next one.')
          : t('gt.load.note', 'One EPC per line, one RR each — paste real EPCs your server knows. One forklift carries up to 18 RR in one pass.')}
      </p>
    </section>
  );
}
