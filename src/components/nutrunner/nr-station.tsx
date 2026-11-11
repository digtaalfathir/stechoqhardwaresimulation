import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { NutrunnerSimulator } from '../../simulators/nutrunner/nutrunner';
import { useT } from '../../lib/i18n';

/** The station is drawn at this size and scaled to fit, never cut. */
const STATION = { width: 820, height: 500 };
/** The plate the bolts sit in, and how many we draw at most. */
const PLATE = { left: 330, right: 790, top: 392 };
const MAX_BOLTS = 10;

/** Holding the trigger: the on-screen button, or the space bar. */
function useTrigger(sim: NutrunnerSimulator) {
  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || typing(e)) return;
      e.preventDefault();
      if (!e.repeat) sim.pressTrigger();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || typing(e)) return;
      e.preventDefault();
      sim.releaseTrigger();
    };
    const blur = () => sim.releaseTrigger();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [sim]);
}

/** Press on the button, release anywhere. */
function holdProps(sim: NutrunnerSimulator) {
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      sim.pressTrigger();
      const up = () => {
        sim.releaseTrigger();
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
  };
}

type BoltLook = 'ok' | 'ng' | 'now' | 'wait';

/**
 * A tightening station: the controller on the bench, the tool hanging from its
 * balancer over the next bolt, and a plain plate with one bolt per fastening in
 * the batch. The tool moves along the plate as the batch progresses.
 */
export function NrStation({ sim }: { sim: NutrunnerSimulator }) {
  const t = useT();
  const st = sim.state;
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useTrigger(sim);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      // Leave room for the control strip under the scene (it wraps on narrow screens).
      const strip = (el.nextElementSibling as HTMLElement | null)?.offsetHeight ?? 62;
      const room = window.innerHeight - Math.min(top, window.innerHeight * 0.45) - 16 - strip;
      setScale(Math.min(1.15, el.clientWidth / STATION.width, Math.max(0.45, room / STATION.height)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener('resize', fit);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, []);

  const batchSize = sim.num('batchSize');
  const bolts = Math.min(MAX_BOLTS, Math.max(1, batchSize));
  const done = st.batchDone && st.phase === 'OK' ? bolts : Math.min(st.batchCounter, bolts);
  const current = Math.min(done, bolts - 1);
  const look = (i: number): BoltLook => {
    if (i < done) return 'ok';
    if (i === current) return st.phase === 'NG' ? 'ng' : 'now';
    return 'wait';
  };
  const step = (PLATE.right - PLATE.left) / bolts;
  const boltX = (i: number) => PLATE.left + step * (i + 0.5);
  const toolX = boltX(current);

  const running = st.phase === 'TIGHTENING';
  const ring = st.phase === 'OK' ? 'ok' : st.phase === 'NG' || st.phase === 'ERROR' ? 'ng' : running ? 'run' : '';
  const hold = holdProps(sim);
  const online = sim.status !== 'OFFLINE';
  const okBolts = Math.min(st.batchCounter, bolts);

  return (
    <section className="panel nr-station-panel">
      <div className="nr-stage-box" ref={box} style={{ height: STATION.height * scale }}>
        <div className="nr-stage" style={{ width: STATION.width, height: STATION.height, transform: `translateX(-50%) scale(${scale})` }}>
          <div className="nr-wall" />
          <div className="nr-bench" />

          <Controller sim={sim} />

          <div className="nr-rail" />
          <div className="nr-trolley" style={{ left: toolX - 22 }} />
          <div className="nr-spring" style={{ left: toolX - 2 }} />

          <svg className="nr-cable" viewBox={`0 0 ${STATION.width} ${STATION.height}`}>
            <path
              d={`M 286 330 C 330 330, ${toolX - 160} 70, ${toolX - 10} 92`}
              fill="none"
              stroke="#1d2126"
              strokeWidth="6"
              strokeLinecap="round"
            />
          </svg>

          <div className={`nr-tool${running ? ' running' : ''}`} style={{ left: toolX - 50 }}>
            <div className="nr-tool-head" />
            <div className="nr-tool-band" />
            <div className={`nr-tool-ring ${ring}`} />
            <div className="nr-tool-body" />
            <div className={`nr-tool-trigger${st.held ? ' held' : ''}`} />
            <div className="nr-tool-spindle" />
            <div className="nr-tool-socket" />
          </div>

          <div className="nr-plate" style={{ left: PLATE.left - 20, width: PLATE.right - PLATE.left + 40, top: PLATE.top }} />
          {Array.from({ length: bolts }, (_, i) => (
            <span key={i} className={`nr-bolt ${look(i)}`} style={{ left: boltX(i) - 18, top: PLATE.top + 10 }}>
              {i + 1}
            </span>
          ))}
          <span className="nr-plate-label" style={{ left: PLATE.left - 20, top: PLATE.top + 70 }}>
            {batchSize > 0
              ? `${t('nr.plate', 'workpiece')} · ${batchSize} ${t('nr.bolts', 'bolts')}${batchSize > MAX_BOLTS ? ` (${MAX_BOLTS} ${t('nr.shown', 'shown')})` : ''}`
              : t('nr.plate.single', 'workpiece · no batch')}
            {sim.cfg('vin') ? ` · VIN ${sim.cfg('vin')}` : ''}
          </span>
        </div>
      </div>

      <div className="nr-strip">
        <button
          type="button"
          className={`btn nr-hold${st.held ? ' held' : ''}`}
          disabled={!online || st.phase === 'TIGHTENING' && !st.held}
          {...hold}
        >
          ⏵ {running ? t('nr.tightening', 'Tightening…') : t('nr.hold', 'Hold trigger')}
          <small>{t('nr.hold.hint', 'or hold Space · let go early = NG')}</small>
        </button>
        <button type="button" className="btn btn-sm" disabled={running} onClick={() => sim.run('force-ok')}>
          Force OK
        </button>
        <button type="button" className="btn btn-sm" disabled={running} onClick={() => sim.run('force-ng')}>
          Force NG
        </button>
        {st.phase === 'ERROR' ? (
          <button type="button" className="btn btn-sm btn-primary" onClick={() => sim.run('reset')}>
            {t('nr.reset', 'Reset alarm')}
          </button>
        ) : (
          <button type="button" className="btn btn-sm btn-danger" onClick={() => sim.run('trigger-error')}>
            {t('nr.alarm', 'Alarm')}
          </button>
        )}
        <span className="spacer" />
        <span className="nr-batch">
          <b>
            {batchSize > 0 ? `Batch ${okBolts} / ${batchSize}` : t('nr.nobatch', 'No batch')}
          </b>
          {batchSize > 0 && (
            <span className="nr-dots">
              {Array.from({ length: bolts }, (_, i) => (
                <i key={i} className={look(i)} />
              ))}
            </span>
          )}
          <span className="muted">
            {st.okCount} OK · {st.ngCount} NG
          </span>
        </span>
      </div>
    </section>
  );
}

/**
 * A tower controller after the Desoutter CVI3: grey case with its side in
 * view, a black front with red edge lines, a colour screen, home and power
 * keys, a red lower panel with the RFID reader, green light slits. No logo.
 */
function Controller({ sim }: { sim: NutrunnerSimulator }) {
  const st = sim.state;
  const unit = sim.cfg('torqueUnit');
  const tq = sim.torqueLimits();
  const an = sim.angleLimits();
  const tone = (s: string | null) => (st.phase === 'TIGHTENING' ? 'run' : s === 'OK' ? 'ok' : s ? 'ng' : 'idle');
  const bar = (v: number, min: number, max: number) => {
    const top = max * 1.25 || 1;
    return {
      fill: `${Math.min(100, (v / top) * 100)}%`,
      from: `${(min / top) * 100}%`,
      width: `${((max - min) / top) * 100}%`,
    };
  };
  const tb = bar(st.torque, tq.min, tq.max);
  const ab = bar(st.angle, an.min, an.max);
  const error = st.phase === 'ERROR';
  return (
    <div className="nr-ctrl">
      <div className="nr-ctrl-side">
        <span className="nr-panel-line" style={{ top: 40 }} />
        <span className="nr-panel-line" style={{ top: 200 }} />
        <span className="nr-screw" style={{ left: 10, top: 14 }} />
        <span className="nr-screw" style={{ left: 10, bottom: 14 }} />
      </div>
      <div className="nr-ctrl-front">
        <span className="nr-red-edge left" />
        <span className="nr-red-edge right" />
        <div className="nr-screen">
          <div className="nr-scr-head">
            <b>Station {sim.num('cellId')}</b>
            <span>Pset {sim.num('psetId')}</span>
          </div>
          {error ? (
            <div className="nr-scr-alarm">
              <b>ALARM</b>
              <span>{st.errorCode}</span>
            </div>
          ) : (
            <>
              <div className={`nr-scr-box ${tone(st.torqueStatus)}`}>
                <small>TORQUE</small>
                <b>
                  {st.torque.toFixed(2)} <em>{unit === 'Nm' ? 'N.m' : unit}</em>
                </b>
                <span className="nr-scr-bar">
                  <i className="win" style={{ left: tb.from, width: tb.width }} />
                  <i className="val" style={{ width: tb.fill }} />
                </span>
              </div>
              <div className={`nr-scr-box ${tone(st.angleStatus)}`}>
                <small>ANGLE</small>
                <b>
                  {st.angle} <em>Deg</em>
                </b>
                <span className="nr-scr-bar">
                  <i className="win" style={{ left: ab.from, width: ab.width }} />
                  <i className="val" style={{ width: ab.fill }} />
                </span>
              </div>
            </>
          )}
          <div className="nr-scr-foot">
            <span>ID {st.tighteningId}</span>
            <span>{sim.num('batchSize') > 0 ? `${st.batchCounter}/${sim.num('batchSize')}` : '—'}</span>
            <span className={`nr-scr-verdict ${st.phase === 'OK' ? 'ok' : st.phase === 'NG' || error ? 'ng' : ''}`}>
              {st.phase === 'TIGHTENING' ? 'RUN' : st.phase === 'READY' ? 'READY' : st.phase}
            </span>
          </div>
        </div>
        <div className="nr-keys">
          <span className="nr-key">⌂</span>
          <span className="nr-key">⏻</span>
        </div>
        <div className="nr-ctrl-red">
          <span className="nr-rfid">RFID</span>
        </div>
      </div>
      <span className={`nr-slit left${error ? ' err' : sim.status === 'OFFLINE' ? ' off' : ''}`} />
      <span className={`nr-slit right${error ? ' err' : sim.status === 'OFFLINE' ? ' off' : ''}`} />
      <span className="nr-ctrl-name">
        {sim.cfg('controllerName')} · {sim.cfg('ip')}:{sim.num('port')}
      </span>
    </div>
  );
}
