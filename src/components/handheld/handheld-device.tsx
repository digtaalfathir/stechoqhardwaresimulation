import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AIM, ANTENNA, BEAM, BENCH, quality, type RfidHandheldSimulator } from '../../simulators/rfid/rfid-handheld';
import type { SimEvent } from '../../simulators/core/types';
import { useSimulator } from '../../lib/use-simulator';
import { useT } from '../../lib/i18n';
import { EventStream, PayloadInspector } from '../event-stream';
import { SendResult } from '../device-panels';
import { CommunicationLog } from '../workspace';
import { HandheldApp } from './handheld-app';
import { beep } from './sound';
import './handheld.css';

/** The stage's height is fixed and scaled to fit the window; its width grows with the bench. */
const STAGE = { height: 880 };
/** Where the bench starts: right at the antenna's face. */
const BENCH_LEFT = 436;
/** Past this a wider bench only spreads the tags thinner. */
const BENCH_MAX = 2000;

/**
 * The handheld workspace: the device and the tags on the bench beside it, with
 * the engineer's view (what went over the wire) in a column on the right.
 */
export function HandheldWorkspace({ sim }: { sim: RfidHandheldSimulator }) {
  useSimulator(sim);
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const selected: SimEvent | null = sim.events.find((e) => e.seq === selectedSeq) ?? sim.events[0] ?? null;

  // The handheld is switched on as soon as it is picked up.
  useEffect(() => {
    if (sim.status === 'OFFLINE') sim.applyConfig({});
    else void sim.ensureMasterData();
  }, [sim]);

  return (
    <>
      <div className="hh-layout">
        <Stage sim={sim} />
        <div className="hh-side">
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

function Stage({ sim }: { sim: RfidHandheldSimulator }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    // The whole device should be visible without scrolling: fit what is left of
    // the window below the header, not the whole window.
    //
    // The height sets the scale; whatever width is left over goes to the bench,
    // so the tags get the whole panel instead of a strip beside empty space.
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const room = window.innerHeight - Math.min(top, window.innerHeight * 0.45) - 16;
      const avail = el.clientWidth - 24;
      let s = Math.min(1, Math.max(0.5, room / STAGE.height));
      let bench = avail / s - BENCH_LEFT - 12;
      if (bench < BENCH.width) {
        bench = BENCH.width;
        s = Math.min(s, avail / (BENCH_LEFT + BENCH.width + 12));
      }
      sim.setBenchWidth(Math.min(BENCH_MAX, bench));
      setScale(s);
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

  useTriggerKeys(sim);
  useDeviceSounds(sim);

  return (
    <section className="panel hh-stage-panel" ref={wrap}>
      <div className="hh-stage-box" style={{ height: STAGE.height * scale }}>
        <div
          className="hh-stage"
          style={{ width: BENCH_LEFT + sim.state.benchWidth + 12, height: STAGE.height, transform: `scale(${scale})` }}
        >
          <Bench sim={sim} scale={scale} />
          <Device sim={sim} />
        </div>
      </div>
    </section>
  );
}

// --- trigger --------------------------------------------------------------------

/** Space bar = trigger, held like the real one. Ignored while typing. */
function useTriggerKeys(sim: RfidHandheldSimulator) {
  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || typing(e)) return;
      // Also keeps a focused button from being "clicked" by the space bar.
      e.preventDefault();
      if (!e.repeat) sim.pressTrigger();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || typing(e)) return;
      e.preventDefault();
      sim.releaseTrigger();
    };
    // Switching windows mid-hold would otherwise leave the trigger stuck down.
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

/** Press on the element, release anywhere — a finger sliding off still lets go. */
function holdProps(sim: RfidHandheldSimulator) {
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

// --- sound and light --------------------------------------------------------------

function useDeviceSounds(sim: RfidHandheldSimulator) {
  const last = useRef({ detected: 0, send: sim.state.send, beepAt: 0 });
  useEffect(() => {
    const unsubscribe = sim.subscribe(() => {
      const vol = sim.bool('sound') ? sim.num('volume') / 100 : 0;
      const detected = sim.detected();
      const prev = last.current;
      const now = performance.now();
      // A reader beeps per read; one tick per 120 ms keeps it a buzz, not a wall.
      if (detected > prev.detected && now - prev.beepAt > 120) {
        beep.read(vol);
        prev.beepAt = now;
      }
      if (sim.state.send !== prev.send) {
        if (sim.state.send === 'sent') beep.sent(vol);
        if (sim.state.send === 'failed') beep.failed(vol);
      }
      prev.detected = detected;
      prev.send = sim.state.send;
    });
    return () => {
      unsubscribe();
    };
  }, [sim]);
}

function Device({ sim }: { sim: RfidHandheldSimulator }) {
  const st = sim.state;
  const led = st.scanning ? 'reading' : st.send === 'sending' ? 'busy' : st.send === 'sent' && st.session.length ? 'ok' : st.send === 'failed' && st.session.length ? 'bad' : '';
  const hold = holdProps(sim);
  return (
    <div className="hh-device">
      <div className="hh-antenna">
        <span className="hh-antenna-mark">RFID</span>
      </div>
      <div className="hh-body">
        <span className="hh-side-key left" />
        <span className="hh-side-key right" />
        <span className={`hh-led ${led}`} />
        <span className="hh-speaker" />
        <div className="hh-screen">
          <div className="hh-screen-inner">
            <HandheldApp sim={sim} />
          </div>
        </div>
        <div className="hh-keypad" aria-hidden="true">
          <div className="kr">
            <span className="k sm">P1</span>
            <span className={`k scan${st.scanning ? ' held' : ''}`} title="Scan — hold" {...hold}>
              • • •
            </span>
            <span className="k sm">◆</span>
          </div>
          <div className="kr">
            <span className="k light">◀</span>
            <span className="k light">▲</span>
            <span className="k light">▼</span>
            <span className="k light">▶</span>
          </div>
          <div className="kr">
            <span className="k">ESC</span>
            <span className="k">TAB</span>
            <span className="k">ALT</span>
            <span className="k">CTRL</span>
          </div>
          {[
            ['1', ''],
            ['2', 'ABC'],
            ['3', 'DEF'],
            ['4', 'GHI'],
            ['5', 'JKL'],
            ['6', 'MNO'],
            ['7', 'PQRS'],
            ['8', 'TUV'],
            ['9', 'WXYZ'],
            ['·', ''],
            ['0', ''],
            ['ENT', ''],
          ]
            .reduce<[string, string][][]>((rows, key, i) => {
              if (i % 3 === 0) rows.push([]);
              rows[rows.length - 1].push(key as [string, string]);
              return rows;
            }, [])
            .map((row, r) => (
              <div className="kr" key={r}>
                {row.map(([n, l]) => (
                  <span key={n} className="k num">
                    {n}
                    {l && <em>{l}</em>}
                  </span>
                ))}
              </div>
            ))}
          <div className="kr">
            <span className="k">⌫</span>
            <span className="k">␣</span>
            <span className="k">SHIFT</span>
          </div>
          <div className="kr">
            <span className="k alpha">ALPHA</span>
            <span className="k func">FUNC</span>
            <span className="k pwr">⏻</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- bench ----------------------------------------------------------------------

function Bench({ sim, scale }: { sim: RfidHandheldSimulator; scale: number }) {
  const t = useT();
  const st = sim.state;
  // While Power is being dragged in Pengaturan the bench already shows its reach.
  const power = st.powerPreview ?? sim.num('power');
  const range = sim.range(power);
  const [epc, setEpc] = useState('');
  const [error, setError] = useState(false);
  const drag = useRef<{ epc: string; dx: number; dy: number } | null>(null);
  const read = new Map(st.session.map((r) => [r.epc, r]));

  const add = () => {
    const lines = epc.split(/[\s,;]+/).filter(Boolean);
    if (!lines.length) return;
    const bad = lines.filter((l) => !sim.addBenchTag(l));
    setError(bad.length > 0);
    setEpc(bad.join('\n'));
  };

  return (
    <div className="hh-bench-area" style={{ left: BENCH_LEFT, width: st.benchWidth }}>
      <div
        className="hh-bench"
        style={{ width: st.benchWidth, height: BENCH.height }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const box = e.currentTarget.getBoundingClientRect();
          sim.moveBenchTag(d.epc, (e.clientX - box.left) / scale - d.dx, (e.clientY - box.top) / scale - d.dy);
        }}
        onPointerUp={() => (drag.current = null)}
      >
        <Beam range={range} width={st.benchWidth} live={st.scanning} />
        <span className="hh-range-label">
          {t('hh.range', 'Antenna range')} · Power {power}
          {st.powerPreview !== null && <em> · {t('hh.unsaved', 'not saved yet')}</em>}
        </span>
        {st.bench.map((tag) => {
          const r = read.get(tag.epc);
          const inRange = sim.inRange(tag, power);
          const cls = r ? `read q-${quality(r)}` : inRange ? 'in' : 'out';
          return (
            <div
              key={tag.epc}
              className={`hh-tag ${cls}`}
              style={{ left: tag.x - 68, top: tag.y - 30 }}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                const box = e.currentTarget.parentElement!.getBoundingClientRect();
                drag.current = {
                  epc: tag.epc,
                  dx: (e.clientX - box.left) / scale - tag.x,
                  dy: (e.clientY - box.top) / scale - tag.y,
                };
              }}
              title={tag.epc}
            >
              {r && <span className="hh-tag-badge">✓</span>}
              <b>…{tag.epc.slice(-10)}</b>
              <span className="hh-tag-meta">
                {r ? `R:${r.reads} · ${r.rssi} dBm` : inRange ? t('hh.inrange', 'in range') : t('hh.outrange', 'out of range')}
              </span>
              <button type="button" className="hh-tag-x" aria-label={`Remove ${tag.epc}`} onClick={() => sim.removeBenchTag(tag.epc)}>
                ✕
              </button>
            </div>
          );
        })}
      </div>
      <div className="hh-tray" style={{ bottom: 12, width: BENCH.width }}>
        <div className="hh-add">
          <input
            className={`mono-input${error ? ' bad' : ''}`}
            placeholder={t('hh.epc', 'EPC — paste one or more')}
            value={epc}
            spellCheck={false}
            onChange={(e) => {
              setEpc(e.target.value);
              setError(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button type="button" className="btn btn-sm btn-primary" onClick={add} disabled={!epc.trim()}>
            {t('hh.add', 'Add')}
          </button>
        </div>
        <div className="hh-tray-row">
          <button type="button" className="btn btn-sm" onClick={() => [0, 1, 2, 3, 4].forEach(() => sim.addBenchTag())}>
            {t('hh.random', 'Random ×5')}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => sim.clearBench()} disabled={!st.bench.length}>
            {t('hh.clear', 'Clear bench')}
          </button>
        </div>
        <p className="hh-hint">
          {t('hh.hint', 'Hold the yellow key or')} <kbd>Space</kbd> {t('hh.hint.b', 'to scan; release to send. Drag tags in and out of range.')}
        </p>
      </div>
    </div>
  );
}

/**
 * The antenna's reach, drawn like the WiFi symbol turned on its side: arcs
 * fanning out to the right, the outermost one at the edge of the range. The
 * fan is the beam the engine reads within, so what is drawn is what is read.
 */
function Beam({ range, width, live }: { range: number; width: number; live: boolean }) {
  const { x, y } = ANTENNA;
  const from = AIM - BEAM;
  const to = AIM + BEAM;
  const at = (r: number, a: number) => `${(x + r * Math.cos(a)).toFixed(1)} ${(y + r * Math.sin(a)).toFixed(1)}`;
  const arc = (r: number) => `M ${at(r, from)} A ${r} ${r} 0 0 1 ${at(r, to)}`;
  const arcs = [1, 2, 3, 4].map((i) => (range * i) / 4);
  // Clipped to the bench: past its bottom there is nothing to read anyway.
  return (
    <svg className={`hh-range${live ? ' live' : ''}`} width={width} height={BENCH.height} aria-hidden="true">
      {range > 0 && (
        <>
          <path className="hh-beam" d={`M ${x} ${y} L ${at(range, from)} A ${range} ${range} 0 0 1 ${at(range, to)} Z`} />
          {arcs.map((r, i) => (
            <path key={i} className="hh-arc" d={arc(r)} style={{ animationDelay: `${i * 0.14}s` }} />
          ))}
        </>
      )}
      <circle className="hh-origin" cx={x} cy={y} r={8} />
    </svg>
  );
}
