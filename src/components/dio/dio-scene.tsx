import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ChannelKind, DigitalIoSimulator } from '../../simulators/digital-io/digital-io';
import { useT } from '../../lib/i18n';

/** The scene is drawn at this size and scaled to fit, never cut. */
const W = 880;
const H = 540;
/** Terminal blocks: top edge of the inputs, bottom edge of the outputs. */
const TOP = 190;
const BOT = 370;
const IN_Y = 30;
const OUT_Y = 420;

type InKind = 'start' | 'stop' | 'prox' | 'eye' | 'limit' | 'door' | 'sel' | 'estop';
type OutKind = 'valve' | 'buzzer' | 'lamp' | 'motor' | 'relay';

/** What is wired to each input, by channel, repeating past eight. */
const INPUTS: { kind: InKind; name: string; momentary?: boolean }[] = [
  { kind: 'start', name: 'Start button', momentary: true },
  { kind: 'stop', name: 'Stop button', momentary: true },
  { kind: 'prox', name: 'Proximity sensor' },
  { kind: 'eye', name: 'Photo-eye' },
  { kind: 'limit', name: 'Limit switch' },
  { kind: 'door', name: 'Door switch' },
  { kind: 'sel', name: 'Selector' },
  { kind: 'estop', name: 'E-stop' },
];
/** Outputs 1-3 drive one stack light; the rest repeat these. */
const TOWER = ['Stack light green', 'Stack light amber', 'Stack light red'];
const OUTPUTS: { kind: OutKind; name: string }[] = [
  { kind: 'valve', name: 'Solenoid valve' },
  { kind: 'buzzer', name: 'Buzzer' },
  { kind: 'lamp', name: 'Pilot lamp' },
  { kind: 'motor', name: 'Motor' },
  { kind: 'relay', name: 'Relay' },
];

export const inputDevice = (i: number) => INPUTS[i % INPUTS.length];
export const outputName = (i: number) => (i < 3 ? TOWER[i] : OUTPUTS[(i - 3) % OUTPUTS.length].name);

/** Click switches a channel; a push button is ON only while held. */
function channelProps(sim: DigitalIoSimulator, kind: ChannelKind, i: number, momentary = false) {
  const on = (kind === 'DI' ? sim.state.inputs : sim.state.outputs)[i];
  const press = () => (momentary ? sim.set(kind, i, true) : sim.toggle(kind, i));
  const release = () => momentary && sim.set(kind, i, false);
  return {
    role: 'button',
    tabIndex: 0,
    'aria-pressed': on,
    className: `dio-dev${on ? ' on' : ''}`,
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      press();
      if (!momentary) return;
      const up = () => {
        release();
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (!e.repeat) press();
    },
    onKeyUp: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') release();
    },
  };
}

/**
 * The I/O box on its DIN rail: an ESP32 and a W5500 Ethernet module behind a
 * window, inputs on the top terminal block, outputs on the bottom one, with
 * the sensors and the loads wired to them.
 */
export function DioScene({ sim }: { sim: DigitalIoSimulator }) {
  const t = useT();
  const st = sim.state;
  const n = st.inputs.length;
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const strip = (el.nextElementSibling as HTMLElement | null)?.offsetHeight ?? 56;
      const room = window.innerHeight - Math.min(top, window.innerHeight * 0.45) - 16 - strip;
      setScale(Math.min(1.3, el.clientWidth / W, Math.max(0.45, room / H)));
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

  // The box grows with the channel count; the field devices share the width.
  const pitch = n <= 8 ? 30 : 22;
  const modW = (n + 1) * pitch + 36;
  const modX = 470 - modW / 2;
  const T = (i: number) => modX + 18 + pitch * (i + 0.5);
  const inPitch = W / n;
  const inX = (i: number) => inPitch * (i + 0.5);
  const kIn = Math.min(1, inPitch / 105);
  const slots = n - 2;
  const outPitch = W / slots;
  const outX = (s: number) => outPitch * (s + 0.5);
  const kOut = Math.min(1, outPitch / 120);
  const named = (p: number) => p >= 80;
  const outLabelY = OUT_Y + 86 * kOut + 10;
  const online = sim.status !== 'OFFLINE';
  const transport = sim.cfg('transport');
  const lan =
    transport === 'REST'
      ? `POST ${sim.cfg('endpoint')}`
      : transport === 'MQTT'
        ? `MQTT ${sim.cfg('topic')}`
        : `LAN → ${sim.cfg('ip')}:${sim.num('port')}`;

  const wire = (key: string, x1: number, y1: number, x2: number, y2: number, on: boolean, cls: string) => {
    const my = (y1 + y2) / 2;
    const d = `M${x1} ${y1} C${x1} ${my},${x2} ${my},${x2} ${y2}`;
    return (
      <g key={key} className={`dio-wire ${cls}${on ? ' on' : ''}`}>
        {on && <path d={d} className="glow" />}
        <path d={d} />
      </g>
    );
  };
  const label = (x: number, y: number, ch: string, name: string | null, on: boolean) => (
    <g className="dio-label">
      <text x={x} y={y} className={`ch${on ? ' on' : ''}`}>
        {ch}
      </text>
      {name && (
        <text x={x} y={y + 12} className="name">
          {name}
        </text>
      )}
    </g>
  );

  const tower = [0, 1, 2].map((i) => st.outputs[i]);

  return (
    <section className="panel dio-scene-panel">
      <div className="dio-stage-box" ref={box} style={{ height: H * scale }}>
        <svg
          className="dio-stage"
          width={W * scale}
          height={H * scale}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${sim.cfg('deviceId')}: ${n} inputs, ${n} outputs`}
        >
          <Defs />
          <rect width={W} height={H} className="dio-wall" />
          <rect x={modX - 140} y={176} width={modW + 230} height={210} rx={4} className="dio-plate" />
          <text x={modX - 130} y={192} className="dio-plate-label">
            CONTROL PANEL
          </text>

          {/* wires under everything */}
          {st.inputs.map((on, i) => wire(`wi${i}`, inX(i), IN_Y + 90 * kIn, T(i), TOP, on, 'di'))}
          {st.outputs.map((on, i) => {
            const x = i < 3 ? outX(0) + (i - 1) * 8 * kOut : outX(i - 2);
            return wire(`wo${i}`, T(i), BOT, x, OUT_Y + (i < 3 ? -8 * kOut : 0), on, 'do');
          })}
          <path d={`M${modX - 54} 214 C${modX - 54} 180,${T(n)} 180,${T(n)} ${TOP}`} className="dio-pwr p24" />
          <path d={`M${modX - 74} 324 C${modX - 74} 392,${T(n)} 392,${T(n)} ${BOT}`} className="dio-pwr p0" />

          {/* DIN rail, power supply */}
          <rect x={modX - 130} y={272} width={modW + 190} height={14} fill="url(#dio-rail)" stroke="#9aa3ac" />
          {Array.from({ length: Math.floor((modW + 180) / 24) }, (_, k) => (
            <rect key={k} x={modX - 122 + k * 24} y={277} width={12} height={4} rx={2} fill="#8d969f" />
          ))}
          <rect x={modX + modW + 26} y={266} width={10} height={26} fill="#8f979f" />
          <g>
            <rect x={modX - 104} y={214} width={80} height={110} rx={3} fill="url(#dio-body)" stroke="#a9b0b7" />
            <rect x={modX - 96} y={226} width={64} height={16} rx={2} fill="#2b3036" />
            <text x={modX - 64} y={237} className="dio-mono light" textAnchor="middle">
              24 VDC
            </text>
            <circle cx={modX - 89} cy={256} r={3.5} fill={online ? '#22c55e' : '#9aa3ab'} />
            <text x={modX - 81} y={259} className="dio-mono tiny">
              DC OK
            </text>
            {[0, 1, 2, 3].map((k) => (
              <circle key={k} cx={modX - 88 + k * 16} cy={306} r={4.5} fill="#9aa2aa" stroke="#6f7881" />
            ))}
          </g>

          <IoBox sim={sim} modX={modX} modW={modW} T={T} online={online} />

          {/* LAN out of the side of the box */}
          <path
            d={`M${modX + modW + 16} 287 C ${modX + modW + 70} 287, ${W - 120} 206, ${W} 206`}
            className="dio-lan"
          />
          <text x={W - 8} y={198} className="dio-mono lan" textAnchor="end">
            {lan}
          </text>

          {/* field inputs */}
          {st.inputs.map((on, i) => {
            const dev = inputDevice(i);
            return (
              <g key={`di${i}`} {...channelProps(sim, 'DI', i, dev.momentary)}>
                <title>{`${sim.channelName('DI', i)} · ${dev.name}`}</title>
                <g transform={`translate(${inX(i)} ${IN_Y}) scale(${kIn})`}>
                  <rect x={-50} y={-4} width={100} height={98} className="hit" />
                  {inputArt(dev.kind, on)}
                </g>
                {label(inX(i), 12, sim.channelName('DI', i), named(inPitch) ? dev.name : null, on)}
              </g>
            );
          })}

          {/* field outputs */}
          <g>
            <title>DO01–DO03 · stack light</title>
            <g transform={`translate(${outX(0)} ${OUT_Y}) scale(${kOut})`}>
              <Tower sim={sim} on={tower} />
            </g>
            {label(outX(0), outLabelY, 'DO01–03', named(outPitch) ? 'stack light' : null, tower.some(Boolean))}
          </g>
          {st.outputs.slice(3).map((on, k) => {
            const i = k + 3;
            const dev = OUTPUTS[k % OUTPUTS.length];
            return (
              <g key={`do${i}`} {...channelProps(sim, 'DO', i)}>
                <title>{`${sim.channelName('DO', i)} · ${dev.name}`}</title>
                <g transform={`translate(${outX(k + 1)} ${OUT_Y}) scale(${kOut})`}>
                  <rect x={-55} y={-6} width={110} height={88} className="hit" />
                  {outputArt(dev.kind, on)}
                </g>
                {label(outX(k + 1), outLabelY, sim.channelName('DO', i), named(outPitch) ? dev.name : null, on)}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="dio-strip">
        <button type="button" className="btn btn-sm btn-primary" disabled={!online} onClick={() => sim.run('randomize-inputs')}>
          {t('dio.random', 'Randomize inputs')}
        </button>
        <button type="button" className="btn btn-sm" disabled={!online} onClick={() => sim.run('pulse-output')}>
          {t('dio.pulse', 'Pulse DO01')}
        </button>
        <button type="button" className="btn btn-sm" disabled={!online} onClick={() => sim.run('all-outputs-off')}>
          {t('dio.alloff', 'All outputs OFF')}
        </button>
        <button type="button" className="btn btn-sm btn-danger" onClick={() => sim.run('reset')}>
          Reset
        </button>
        <small className="muted">{t('dio.hint', 'click a device to switch it · push buttons act while held')}</small>
        <span className="spacer" />
        <b className="dio-count">
          {st.inputs.filter(Boolean).length} DI · {st.outputs.filter(Boolean).length} DO ON
        </b>
      </div>
    </section>
  );
}

function Defs() {
  return (
    <defs>
      <linearGradient id="dio-rail" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#d7dce1" />
        <stop offset=".5" stopColor="#a9b1b9" />
        <stop offset="1" stopColor="#cfd5db" />
      </linearGradient>
      <linearGradient id="dio-body" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#cfd4d9" />
        <stop offset=".5" stopColor="#e6e9ec" />
        <stop offset="1" stopColor="#c9ced3" />
      </linearGradient>
      <linearGradient id="dio-metal" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#8b949d" />
        <stop offset=".45" stopColor="#e6e9ec" />
        <stop offset="1" stopColor="#7e8790" />
      </linearGradient>
      <linearGradient id="dio-glass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity=".22" />
        <stop offset=".45" stopColor="#ffffff" stopOpacity=".04" />
        <stop offset="1" stopColor="#ffffff" stopOpacity=".12" />
      </linearGradient>
      <filter id="dio-glow" x="-1" y="-1" width="3" height="3">
        <feGaussianBlur stdDeviation="5" />
      </filter>
    </defs>
  );
}

/** The enclosure: terminal blocks, channel LEDs, and the boards behind the window. */
function IoBox({
  sim,
  modX,
  modW,
  T,
  online,
}: {
  sim: DigitalIoSimulator;
  modX: number;
  modW: number;
  T: (i: number) => number;
  online: boolean;
}) {
  const st = sim.state;
  const n = st.inputs.length;
  const led = (key: string, x: number, y: number, on: boolean, c: string) => (
    <g key={key}>
      {on && <circle cx={x} cy={y} r={7} fill={c} opacity={0.55} filter="url(#dio-glow)" />}
      <circle cx={x} cy={y} r={3.6} fill={on ? c : '#9aa3ab'} stroke="#6c757e" strokeWidth={0.6} />
    </g>
  );
  const block = (y: number, bottom: boolean) => (
    <g>
      <rect x={modX + 8} y={y} width={modW - 16} height={24} rx={2} fill="#2f6e47" stroke="#214f33" />
      {Array.from({ length: n + 1 }, (_, i) => (
        <g key={i}>
          <circle cx={T(i)} cy={y + (bottom ? 17 : 7)} r={4.2} fill="url(#dio-metal)" stroke="#5b646d" strokeWidth={0.6} />
          <line x1={T(i) - 3} x2={T(i) + 3} y1={y + (bottom ? 17 : 7)} y2={y + (bottom ? 17 : 7)} stroke="#4b545c" strokeWidth={1.2} />
          <rect x={T(i) - 4} y={y + (bottom ? 3 : 14)} width={8} height={7} rx={1} fill="#14191d" />
        </g>
      ))}
    </g>
  );
  const wx = modX + 12;
  const ww = modW - 24;
  const esp = wx + 8;
  const eth = wx + ww - 72;
  return (
    <g>
      <rect x={modX} y={202} width={modW} height={156} rx={6} fill="url(#dio-body)" stroke="#a6adb4" />
      {block(TOP, false)}
      {block(BOT - 24, true)}
      <text x={T(n)} y={TOP - 4} className="dio-mono tiny" textAnchor="middle">
        COM
      </text>
      <text x={T(n)} y={BOT + 11} className="dio-mono tiny" textAnchor="middle">
        0V
      </text>

      {st.inputs.map((on, i) => led(`li${i}`, T(i), 226, on && online, '#22c55e'))}
      {st.inputs.map((_, i) => (
        <text key={`ni${i}`} x={T(i)} y={240} className="dio-mono num" textAnchor="middle">
          {i + 1}
        </text>
      ))}
      <text x={T(n)} y={229} className="dio-mono tiny" textAnchor="middle">
        DI
      </text>

      <text x={modX + 14} y={256} className="dio-mono id">
        {sim.cfg('deviceId')}
      </text>
      {(
        [
          ['PWR', true, '#22c55e'],
          ['RUN', online, '#22c55e'],
          ['LNK', online, '#f59e0b'],
        ] as const
      ).map(([name, on, c], k) => (
        <g key={name} className={name === 'RUN' && on ? 'dio-blink' : undefined}>
          <circle cx={modX + modW - 104 + k * 34} cy={253} r={2.6} fill={on ? c : '#9aa3ab'} />
          <text x={modX + modW - 99 + k * 34} y={256} className="dio-mono tiny">
            {name}
          </text>
        </g>
      ))}

      {/* window: the ESP32 and the W5500 inside */}
      <rect x={wx} y={262} width={ww} height={58} rx={3} fill="#1a2620" stroke="#5f6870" />
      <g>
        <rect x={esp} y={268} width={84} height={46} rx={2} fill="#1d1f22" />
        {Array.from({ length: 12 }, (_, k) => (
          <g key={k}>
            <circle cx={esp + 6 + k * 6.6} cy={271} r={1.1} fill="#c9a227" />
            <circle cx={esp + 6 + k * 6.6} cy={311} r={1.1} fill="#c9a227" />
          </g>
        ))}
        <rect x={esp - 3} y={285} width={10} height={10} rx={1} fill="#b8bec4" />
        <rect x={esp + 38} y={275} width={30} height={30} rx={1} fill="#c9ced3" stroke="#8d969f" strokeWidth={0.6} />
        <text x={esp + 53} y={293} className="dio-mono chip" textAnchor="middle">
          ESP32
        </text>
        <path d={`M${esp + 71} 278 h8 v4 h-6 v4 h6 v4 h-6 v4 h6 v4 h-8`} stroke="#c9a227" strokeWidth={1} fill="none" />
        <circle cx={esp + 18} cy={302} r={1.8} fill={online ? '#ef4444' : '#5a2a28'} />
      </g>
      {ww > 170 &&
        ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6'].map((c, k) => (
          <path
            key={c}
            d={`M${esp + 84} ${280 + k * 6} C${esp + 100} ${280 + k * 6},${eth - 16} ${282 + k * 6},${eth} ${282 + k * 6}`}
            stroke={c}
            strokeWidth={1.2}
            fill="none"
          />
        ))}
      <g>
        <rect x={eth} y={268} width={64} height={46} rx={2} fill="#1b4f8f" />
        <rect x={eth + 8} y={281} width={20} height={20} fill="#15181b" />
        <text x={eth + 18} y={293} className="dio-mono chip light" textAnchor="middle">
          W5500
        </text>
        <rect x={eth + 40} y={274} width={24} height={34} rx={1} fill="#c4c9ce" stroke="#7d868f" strokeWidth={0.6} />
        <rect x={eth + 44} y={283} width={16} height={14} fill="#23282d" />
        <circle cx={eth + 46} cy={277} r={1.6} fill={online ? '#22c55e' : '#58625b'} />
        <circle cx={eth + 58} cy={277} r={1.6} fill={online ? '#f59e0b' : '#6b5a3a'} className={online ? 'dio-blink' : undefined} />
      </g>
      <rect x={wx} y={262} width={ww} height={58} rx={3} fill="url(#dio-glass)" />

      {st.outputs.map((_, i) => (
        <text key={`no${i}`} x={T(i)} y={331} className="dio-mono num" textAnchor="middle">
          {i + 1}
        </text>
      ))}
      {st.outputs.map((on, i) => led(`lo${i}`, T(i), 340, on && online, '#f59e0b'))}
      <text x={T(n)} y={343} className="dio-mono tiny" textAnchor="middle">
        DO
      </text>

      {/* RJ45 on the side */}
      <rect x={modX + modW} y={276} width={16} height={22} rx={2} fill="#6b747d" stroke="#4c545c" />
      <rect x={modX + modW + 3} y={281} width={10} height={12} fill="#1b2025" />
    </g>
  );
}

/** The stack light: one segment per output, each clickable on its own. */
function Tower({ sim, on }: { sim: DigitalIoSimulator; on: boolean[] }) {
  const segs: [number, string, string][] = [
    [2, '#ef4444', '#5f2a27'],
    [1, '#f59e0b', '#5f4b22'],
    [0, '#22c55e', '#28502f'],
  ];
  return (
    <>
      <rect x={-13} y={-8} width={26} height={8} rx={4} fill="#3a4047" />
      {segs.map(([ch, c, off], k) => (
        <g key={ch} {...channelProps(sim, 'DO', ch)}>
          <title>{`${sim.channelName('DO', ch)} · ${TOWER[ch]}`}</title>
          {on[ch] && <rect x={-18} y={k * 24 - 2} width={36} height={26} fill={c} opacity={0.55} filter="url(#dio-glow)" />}
          <rect x={-13} y={k * 24} width={26} height={22} fill={on[ch] ? c : off} stroke="#1f2428" strokeWidth={0.8} />
          <rect x={-40} y={k * 24} width={80} height={23} className="hit" />
        </g>
      ))}
      <rect x={-4} y={72} width={8} height={10} fill="#4b525a" />
      <rect x={-16} y={80} width={32} height={6} rx={2} fill="#3a4047" />
    </>
  );
}

function inputArt(kind: InKind, on: boolean): ReactNode {
  const station = <rect x={-26} y={22} width={52} height={62} rx={4} fill="#c9ced4" stroke="#9aa2aa" />;
  switch (kind) {
    case 'start':
    case 'stop': {
      const c = kind === 'start' ? ['#22a559', '#0f6b37', '#22c55e'] : ['#d33a2c', '#8d1f16', '#ef4444'];
      return (
        <>
          {station}
          {on && <circle cx={0} cy={53} r={20} fill={c[2]} opacity={0.5} filter="url(#dio-glow)" />}
          <circle cx={0} cy={53} r={17} fill="#6d7680" />
          <circle cx={0} cy={53} r={on ? 12 : 14} fill={c[0]} stroke={c[1]} />
        </>
      );
    }
    case 'prox':
      return (
        <>
          <rect x={-10} y={16} width={20} height={52} fill="url(#dio-metal)" stroke="#6e7780" />
          {Array.from({ length: 9 }, (_, k) => (
            <line key={k} x1={-10} x2={10} y1={22 + k * 5} y2={20 + k * 5} stroke="#7d868f" strokeWidth={0.8} />
          ))}
          <rect x={-12} y={32} width={24} height={6} fill="#5c656e" />
          <rect x={-10} y={68} width={20} height={8} fill="#2c3238" />
          {on && <circle cx={0} cy={72} r={8} fill="#f59e0b" opacity={0.6} filter="url(#dio-glow)" />}
          <rect x={-8} y={70} width={16} height={4} fill={on ? '#fbbf24' : '#6b5a3a'} />
          <rect x={on ? -20 : 16} y={82} width={40} height={8} fill="#a8b0b8" stroke="#7a838c" className="dio-move" />
        </>
      );
    case 'eye':
      return (
        <>
          <rect x={-44} y={36} width={20} height={30} rx={2} fill="#2f3439" />
          <circle cx={-24} cy={51} r={4} fill={on ? '#fbbf24' : '#c0392b'} />
          <rect x={28} y={38} width={12} height={26} fill="#d0d4d8" stroke="#9aa2aa" />
          <line x1={-20} x2={on ? -4 : 28} y1={51} y2={51} stroke="#ef4444" strokeWidth={1.6} strokeDasharray="4 3" />
          {on && <rect x={-4} y={34} width={22} height={34} fill="#c8a67a" stroke="#9c7b4d" />}
        </>
      );
    case 'limit': {
      const a = ((on ? -10 : -50) * Math.PI) / 180;
      const lx = 30 * Math.cos(a);
      const ly = 46 + 30 * Math.sin(a);
      return (
        <>
          <rect x={-16} y={42} width={32} height={40} rx={2} fill="#c9a227" stroke="#8f7417" />
          <circle cx={0} cy={46} r={4} fill="#5c656e" />
          <line x1={0} y1={46} x2={lx} y2={ly} stroke="#4b545c" strokeWidth={4} strokeLinecap="round" />
          <circle cx={lx} cy={ly} r={6} fill="#2b3036" />
        </>
      );
    }
    case 'door':
      return (
        <>
          <rect x={-44} y={18} width={on ? 40 : 26} height={70} fill="#f2d03b" stroke="#a88f17" opacity={0.9} />
          <rect x={4} y={36} width={22} height={34} rx={2} fill="#f0c419" stroke="#9e8212" />
          <rect x={8} y={42} width={14} height={8} fill="#2b3036" />
          <rect x={on ? -4 : -18} y={49} width={10} height={8} fill="#9aa2aa" />
        </>
      );
    case 'sel':
      return (
        <>
          {station}
          <circle cx={0} cy={53} r={15} fill="#23282d" />
          <rect x={-3} y={40} width={6} height={26} rx={2} fill="#e8ecef" transform={`rotate(${on ? 45 : -45} 0 53)`} />
          <text x={-20} y={34} className="dio-mono tiny">
            0
          </text>
          <text x={15} y={34} className="dio-mono tiny">
            1
          </text>
        </>
      );
    case 'estop':
      return (
        <>
          <rect x={-26} y={22} width={52} height={62} rx={4} fill="#f2c318" stroke="#9e8212" />
          <circle cx={0} cy={53} r={on ? 15 : 18} fill="#c62f22" stroke="#7d1a12" />
          <circle cx={-5} cy={48} r={5} fill="#e0574b" />
        </>
      );
  }
}

function outputArt(kind: OutKind, on: boolean): ReactNode {
  switch (kind) {
    case 'valve':
      return (
        <>
          <rect x={-22} y={0} width={30} height={22} rx={2} fill="#2b3036" />
          <rect x={-18} y={4} width={12} height={14} fill="#3e464e" />
          {on && <circle cx={2} cy={11} r={6} fill="#f59e0b" opacity={0.7} filter="url(#dio-glow)" />}
          <circle cx={2} cy={11} r={2.6} fill={on ? '#fbbf24' : '#6b5a3a'} />
          <rect x={-26} y={22} width={38} height={12} fill="#9aa2aa" stroke="#6f7881" />
          <line x1={-34} y1={34} x2={-34} y2={44} stroke="#2f6fd0" strokeWidth={3} />
          <line x1={2} y1={34} x2={2} y2={44} stroke="#2f6fd0" strokeWidth={3} />
          <rect x={20} y={51} width={on ? 46 : 12} height={8} fill="#c7cdd3" stroke="#7d868f" className="dio-move" />
          <rect x={-50} y={44} width={70} height={22} rx={3} fill="url(#dio-metal)" stroke="#6f7881" />
        </>
      );
    case 'buzzer':
      return (
        <>
          <rect x={-18} y={18} width={36} height={46} rx={5} fill="#23282d" />
          <circle cx={0} cy={34} r={9} fill="#3a4148" />
          {on &&
            [1, 2, 3].map((k) => (
              <path key={k} d={`M${22 + k * 6} 22 q8 18 0 36`} stroke="#e08a00" strokeWidth={2} fill="none" className="dio-blink" />
            ))}
        </>
      );
    case 'lamp':
      return (
        <>
          <rect x={-22} y={14} width={44} height={54} rx={4} fill="#c9ced4" stroke="#9aa2aa" />
          {on && <circle cx={0} cy={41} r={18} fill="#60a5fa" opacity={0.6} filter="url(#dio-glow)" />}
          <circle cx={0} cy={41} r={14} fill="#6d7680" />
          <circle cx={0} cy={41} r={11} fill={on ? '#93c5fd' : '#e8eef4'} stroke="#9aa9b8" />
        </>
      );
    case 'motor':
      return (
        <>
          <rect x={-40} y={20} width={62} height={44} rx={6} fill="#4a6fa5" stroke="#2f4b75" />
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <line key={k} x1={-34 + k * 10} x2={-34 + k * 10} y1={22} y2={62} stroke="#3c5d8c" strokeWidth={2} />
          ))}
          <rect x={-30} y={12} width={20} height={10} fill="#3c5d8c" />
          <rect x={22} y={36} width={14} height={10} fill="url(#dio-metal)" />
          <g transform="translate(44 41)">
            <g className={on ? 'dio-spin' : undefined}>
              <circle r={10} fill="#d7dce1" stroke="#7d868f" />
              <path d="M0 -9 L3 0 L0 9 L-3 0 Z M-9 0 L0 3 L9 0 L0 -3 Z" fill="#6b747d" />
            </g>
          </g>
        </>
      );
    case 'relay':
      return (
        <>
          <rect x={-18} y={16} width={36} height={48} rx={2} fill="#dfe6ee" stroke="#9aa9b8" opacity={0.9} />
          <rect x={-10} y={30} width={20} height={18} fill="#b87333" />
          <line x1={-8} x2={on ? 4 : 8} y1={56} y2={on ? 56 : 52} stroke="#5c656e" strokeWidth={2} />
          {on && <circle cx={11} cy={22} r={5} fill="#f59e0b" opacity={0.7} filter="url(#dio-glow)" />}
          <circle cx={11} cy={22} r={2.6} fill={on ? '#f59e0b' : '#9aa3ab'} />
        </>
      );
  }
}
