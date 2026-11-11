import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { McPlcSimulator } from '../../simulators/plc/mc-plc';
import type { SimEvent } from '../../simulators/core/types';
import { useT } from '../../lib/i18n';
import { PlcStart } from './plc-start';

/** The cabinet is drawn this tall and scaled to fit, never cut; its width fills the panel. */
const CAB = { width: 1352, height: 520 };
/** Narrower than this and the client cards would sit on the rack. */
const CAB_MIN = 1150;

/** A client counts as active while it exchanged frames this recently (it reconnects every cycle). */
export const ACTIVE_MS = 15000;

/** Who talks to the PLC: open connections, or the last client seen if it reconnects per cycle. */
export function activeClients(sim: McPlcSimulator, now = Date.now()): { list: string[]; live: boolean } {
  if (sim.state.clients.length) return { list: sim.state.clients, live: true };
  const last = sim.events.find((e) => MC_EVENTS.has(e.name));
  if (last && now - Date.parse(last.timestamp) < ACTIVE_MS) {
    const client = String((last.payload as { client?: string }).client ?? '');
    return { list: client ? [client] : [], live: false };
  }
  return { list: [], live: false };
}

/** MC frames the client exchanged with the bridge, newest first. */
export const MC_EVENTS = new Set(['MC_READ', 'MC_WRITE', 'MC_ERROR', 'MC_IGNORED']);

/** Re-renders every `ms` while `active`, for blinking and countdowns. */
export function useNow(active: boolean, ms = 120): number {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return Date.now();
}

/**
 * A Q-series rack in its cabinet: power supply, CPU with built-in Ethernet,
 * two I/O modules and blank covers, wired into the ducts, with the LAN cable
 * running to the acquisition program. The LEDs follow the real state: power
 * when the bridge runs, RUN when it answers, ERR when it is silent, SD/RD on
 * every frame — and the cable comes out when the PLC goes offline.
 */
export function PlcCabinet({ sim }: { sim: McPlcSimulator }) {
  const t = useT();
  const st = sim.state;
  const box = useRef<HTMLElement>(null);
  const [fit, setFit] = useState({ scale: 1, width: CAB.width });

  // Height sets the scale; the width left over widens the cabinet, so it
  // fills the panel instead of leaving a strip of nothing on the right.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const room = window.innerHeight - Math.min(top, window.innerHeight * 0.45) - 16;
      let scale = Math.min(1.15, Math.max(0.45, room / CAB.height));
      let width = el.clientWidth / scale;
      if (width < CAB_MIN) {
        scale = el.clientWidth / CAB_MIN;
        width = CAB_MIN;
      }
      setFit({ scale, width });
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

  const frames = sim.events.filter((e) => MC_EVENTS.has(e.name));
  const last = frames[0];
  const lastAt = last ? Date.parse(last.timestamp) : 0;
  const now = useNow(Date.now() - lastAt < 4000 || st.mode === 'silent');

  const up = st.bridge === 'up';
  const plugged = up && st.mode !== 'offline';
  const flash = plugged && now - lastAt < 260;
  const showPacket = plugged && now - lastAt < 1500 && last;
  const blink = Math.floor(now / 400) % 2 === 0;
  // The I/O LEDs are decoration, but a running machine flickers.
  const ioSeed = up ? Math.floor(now / 900) : 0;
  const ioLeds = (salt: number) =>
    Array.from({ length: 16 }, (_, i) => up && ((i * 7 + salt * 13 + ioSeed * (i % 3 === 0 ? 1 : 0)) % 5 === 0 || (i + salt) % 6 === 0));

  return (
    <section className="panel pl-cab-panel" ref={box} style={{ height: CAB.height * fit.scale }}>
      <div className="pl-cab" style={{ width: fit.width, height: CAB.height, transform: `scale(${fit.scale})` }}>
        <div className="pl-duct top" />
        <div className="pl-duct bot" />
        <div className="pl-backplate" />
        <div className="pl-base">
          <span className="pl-screw" style={{ left: 6, top: 6 }} />
          <span className="pl-screw" style={{ right: 6, top: 6 }} />
          <span className="pl-screw" style={{ left: 6, bottom: 6 }} />
          <span className="pl-screw" style={{ right: 6, bottom: 6 }} />
        </div>
        <span className="pl-tag">PLC-01 · {sim.endpoint() || 'localhost'}</span>

        <div className="pl-m pl-psu">
          <div className="pl-band">
            <span className="pl-lbl pl-model">Q61P</span>
            <span className="pl-pwr">
              <i className={up ? 'on' : ''} />
              POWER
            </span>
          </div>
          <span className="pl-seam" />
          <span className="pl-pull">◀ PULL</span>
        </div>

        <div className="pl-m pl-cpu">
          <span className="pl-lbl pl-model">Q03UDVCPU</span>
          <div className="pl-ledcol">
            <span>MODE<i className={up ? 'g' : ''} /></span>
            <span>RUN<i className={up ? 'g' : ''} /></span>
            <span>ERR.<i className={up && st.mode === 'silent' && blink ? 'r' : ''} /></span>
            <span>USER<i /></span>
            <span>BAT.<i /></span>
            <span>BOOT<i /></span>
            <span>SD CARD<i /></span>
          </div>
          <span className="pl-pullt" style={{ left: 8, top: 166 }}>▼ PULL</span>
          <div className="pl-cover" style={{ top: 180, height: 22 }} />
          <span className="pl-pullt" style={{ left: 8, top: 206 }}>▲ PULL</span>
          <span className="pl-pullt" style={{ right: 10, top: 206 }}>USB</span>
          <div className="pl-cover" style={{ top: 220, height: 14 }} />
          <div className="pl-rj" style={{ top: 244 }}>
            <span className={`pl-l1${plugged ? ' on' : ''}`} />
            <span className={`pl-l2${flash ? ' on' : ''}`} />
          </div>
          <span className="pl-pullt" style={{ right: 6, top: 246, fontSize: 7.5 }}>100M</span>
          <span className="pl-pullt" style={{ right: 6, top: 272, fontSize: 7.5 }}>SD RD</span>
          <span className="pl-serial">2603102608671</span>
        </div>

        {(['QX40', 'QY40P'] as const).map((model, k) => (
          <div key={model} className="pl-m pl-io" style={{ left: 336 + k * 96 }}>
            <span className="pl-lbl pl-model">{model}</span>
            <div className="pl-win">
              {ioLeds(k).map((on, i) => (
                <i key={i} className={on ? 'on' : ''} />
              ))}
              {Array.from({ length: 8 }, (_, i) => (
                <b key={`n${i}`}>{i}</b>
              ))}
            </div>
            <div className="pl-term">
              <span className="pl-slotline" />
            </div>
          </div>
        ))}
        <div className="pl-m pl-blank" style={{ left: 528 }}>
          <span className="pl-lbl">QG60</span>
        </div>
        <div className="pl-m pl-blank" style={{ left: 624 }}>
          <span className="pl-lbl">QG60</span>
        </div>

        <svg className="pl-wires" viewBox={`0 0 ${fit.width} ${CAB.height}`}>
          <g fill="none" strokeLinecap="round">
            <path d="M 360 210 C 356 330, 350 430, 352 520" stroke="#1f5fae" strokeWidth="5" />
            <path d="M 372 230 C 370 340, 368 430, 370 520" stroke="#2a6fc0" strokeWidth="5" />
            <path d="M 384 250 C 384 350, 384 430, 386 520" stroke="#e9edf1" strokeWidth="5" />
            <path d="M 456 210 C 452 330, 448 430, 450 520" stroke="#1f5fae" strokeWidth="5" />
            <path d="M 468 230 C 466 340, 464 430, 466 520" stroke="#2a6fc0" strokeWidth="5" />
            <path d="M 480 250 C 480 350, 480 430, 482 520" stroke="#c63b2f" strokeWidth="4" />
            {plugged ? (
              <>
                <path d={lan(fit.width, false)} stroke="#9aa3ad" strokeWidth="9" />
                <path d={lan(fit.width, false)} stroke="#c4cad0" strokeWidth="5" />
              </>
            ) : (
              // Offline: the plug is out and the cable hangs loose.
              <>
                <path d={lan(fit.width, true)} stroke="#9aa3ad" strokeWidth="9" />
                <path d={lan(fit.width, true)} stroke="#c4cad0" strokeWidth="5" />
                <rect x="292" y="392" width="20" height="26" rx="3" fill="#d7dce1" stroke="#9aa3ad" strokeWidth="2" />
              </>
            )}
          </g>
        </svg>
        <span className="pl-wtag" style={{ left: 350, top: 300 }}>X40</span>
        <span className="pl-wtag" style={{ left: 446, top: 300 }}>Y50</span>

        {showPacket && last && <Packets ev={last} key={last.seq} resAt={fit.width - 362 - 330} />}

        {up && st.mode !== 'online' && (
          <span className={`pl-mode-badge ${st.mode}`}>
            {st.mode === 'silent'
              ? t('plc.badge.silent', 'SILENT — connected, never answers')
              : t('plc.badge.offline', 'OFFLINE — cable out, connection refused')}
          </span>
        )}

        <ClientCard sim={sim} frames={frames} />
        <TrafficCard sim={sim} frames={frames} now={now} />
      </div>

      {st.bridge === 'down' && (
        <div className="pl-start-overlay">
          <div className="pl-start-card">
            <PlcStart sim={sim} />
          </div>
        </div>
      )}
    </section>
  );
}

/** From the CPU's port, down along the duct, up to the client card (362 px from the right). */
function lan(width: number, loose: boolean): string {
  const end = width - 362;
  const start = loose ? 'M 302 418 C 300 470, 330 492, 440 490' : 'M 278 368 C 276 440, 300 480, 420 478';
  return `${start} S ${end - 230} 470, ${end - 90} 400 S ${end - 40} 220, ${end} 205`;
}

/** The request on its way in, and the answer on its way back. */
function Packets({ ev, resAt }: { ev: SimEvent; resAt: number }) {
  const p = ev.payload as { device?: string; count?: number; values?: number[]; end_code?: string };
  const values = (p.values ?? []).join(', ');
  const req =
    ev.name === 'MC_WRITE'
      ? `→ 1401 WRITE ${p.device} ← ${values}`
      : ev.name === 'MC_READ'
        ? `→ 0401 READ ${p.device} ×${p.count}`
        : ev.name === 'MC_IGNORED'
          ? '→ request · no answer'
          : `→ ${p.device ?? 'request'}`;
  const res =
    ev.name === 'MC_IGNORED'
      ? null
      : ev.name === 'MC_ERROR'
        ? `← END ${p.end_code}`
        : ev.name === 'MC_WRITE'
          ? '← 0000 OK'
          : `← 0000 OK · ${p.device} = ${values}`;
  return (
    <>
      <span className="pl-pkt req">{req}</span>
      {res && (
        <span className={`pl-pkt res${ev.name === 'MC_ERROR' ? ' bad' : ''}`} style={{ left: resAt }}>
          {res}
        </span>
      )}
    </>
  );
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour12: false });
}

/** The acquisition program as the PLC sees it: who is connected and what they asked. */
function ClientCard({ sim, frames }: { sim: McPlcSimulator; frames: SimEvent[] }) {
  const t = useT();
  const { list: clients } = activeClients(sim);
  const lines = frames.slice(0, 6).map((e) => {
    const p = e.payload as { device?: string; count?: number; values?: number[] };
    const v = (p.values ?? []).join(', ');
    const what =
      e.name === 'MC_READ'
        ? `read  ${p.device} ×${p.count} → ${v}`
        : e.name === 'MC_WRITE'
          ? `write ${p.device} ← ${v}`
          : e.name === 'MC_IGNORED'
            ? 'request — no answer'
            : `refused ${p.device ?? ''}`;
    return `${clock(e.timestamp)}  ${what}`;
  });
  return (
    <div className="pl-hud pl-client">
      <pre className="pl-screen">
        {lines.length ? lines.join('\n') : t('plc.client.wait', `waiting for a client on ${sim.endpoint() || 'localhost:8200'}…`)}
      </pre>
      <h4>
        {t('plc.client', 'Acquisition program')}{' '}
        <span className={`chip${clients.length ? ' t-ok' : ''}`}>
          {clients.length ? t('plc.client.on', 'connected') : t('plc.client.off', 'not connected')}
        </span>
      </h4>
      <p className="mono muted">{clients.length ? clients.join(', ') : '—'}</p>
    </div>
  );
}

/** Read / write / error counts and frames per second over the last 16 s. */
function TrafficCard({ sim, frames, now }: { sim: McPlcSimulator; frames: SimEvent[]; now: number }) {
  const t = useT();
  const buckets = Array.from({ length: 16 }, () => 0);
  for (const e of frames) {
    const age = Math.floor((now - Date.parse(e.timestamp)) / 1000);
    if (age >= 0 && age < 16) buckets[15 - age]++;
  }
  const max = Math.max(1, ...buckets);
  return (
    <div className="pl-hud pl-traffic">
      <div className="pl-row">
        <span className="muted">{t('plc.t.read', 'Read')}</span>
        <b className="mono">{sim.state.reads}</b>
      </div>
      <div className="pl-row">
        <span className="muted">{t('plc.t.write', 'Write')}</span>
        <b className="mono">{sim.state.writes}</b>
      </div>
      <div className="pl-row">
        <span className="muted">{t('plc.errors', 'Error')}</span>
        <b className={`mono${sim.state.errors ? ' t-error' : ''}`}>{sim.state.errors}</b>
      </div>
      <div className="pl-bars">
        {buckets.map((n, i) => (
          <i key={i} className={n === max && n > 0 ? 'hi' : ''} style={{ height: `${Math.max(4, (n / max) * 100)}%` }} />
        ))}
      </div>
      <p className="muted pl-bars-cap">{t('plc.fps', 'frames / second · last 16 s')}</p>
    </div>
  );
}
