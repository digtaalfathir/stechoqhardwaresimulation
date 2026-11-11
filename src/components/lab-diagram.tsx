import { href } from '../lib/router';
import { DeviceArt } from './device-art';

const W = 760;
const H = 470;
const TILE = { w: 176, h: 130 };

/** Where each device sits, the wire to the app, and what travels on it. */
const NODES: { id: string; x: number; y: number; from: [number, number]; to: [number, number]; proto: string; packet: string; reverse?: boolean }[] = [
  { id: 'rfid-handheld', x: 20, y: 18, from: [196, 84], to: [292, 168], proto: 'REST', packet: 'POST scan' },
  { id: 'nutrunner', x: 564, y: 18, from: [564, 84], to: [468, 168], proto: 'Open Protocol', packet: 'MID 0061' },
  { id: 'rfid-reader', x: 20, y: 300, from: [196, 364], to: [292, 236], proto: 'REST', packet: 'POST ×18' },
  { id: 'digital-io', x: 564, y: 300, from: [564, 364], to: [468, 236], proto: 'Modbus TCP', packet: 'FC02' },
  { id: 'plc', x: 292, y: 330, from: [380, 330], to: [380, 268], proto: 'MC 3E', packet: '0401 D11', reverse: true },
];

const SHORT: Record<string, string> = {
  'rfid-handheld': 'RFID Handheld',
  'rfid-reader': 'RFID Gate',
  nutrunner: 'Nutrunner',
  'digital-io': 'Digital I/O',
  plc: 'PLC · MC Protocol',
};

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * The lab at a glance: every simulator wired to your application, with the
 * traffic each one produces moving along its wire. Each device opens its
 * workspace.
 */
export function LabDiagram() {
  const still = reduced();
  return (
    <svg className="lab-diagram" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Five simulated devices wired to your application">
      {NODES.map((n, i) => {
        const [x1, y1] = n.reverse ? n.to : n.from;
        const [x2, y2] = n.reverse ? n.from : n.to;
        const mx = (x1 + x2) / 2;
        const d = `M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
        const vertical = Math.abs(x1 - x2) < 4;
        const path = vertical ? `M${x1} ${y1} L${x2} ${y2}` : d;
        const lx = (n.from[0] + n.to[0]) / 2;
        const ly = (n.from[1] + n.to[1]) / 2;
        return (
          <g key={n.id}>
            <path d={path} className="lab-wire" />
            <g transform={`translate(${vertical ? lx + 44 : lx} ${ly})`}>
              <rect x={-n.proto.length * 3.3 - 8} y={-10} width={n.proto.length * 6.6 + 16} height={20} rx={10} className="lab-proto" />
              <text textAnchor="middle" y={4} className="lab-proto-text">
                {n.proto}
              </text>
            </g>
            <g className="lab-packet">
              <rect x={-n.packet.length * 3 - 7} y={-9} width={n.packet.length * 6 + 14} height={18} rx={4} />
              <text textAnchor="middle" y={4}>
                {n.packet}
              </text>
              {still ? (
                <animateMotion dur="1s" fill="freeze" keyPoints="0.3;0.3" keyTimes="0;1" calcMode="linear" path={path} />
              ) : (
                <animateMotion dur="2.6s" begin={`-${i * 0.5}s`} repeatCount="indefinite" path={path} />
              )}
            </g>
          </g>
        );
      })}

      {/* your application */}
      <g className="lab-app">
        <rect x={286} y={138} width={188} height={124} rx={8} className="lab-screen-frame" />
        <rect x={294} y={146} width={172} height={108} rx={3} className="lab-screen" />
        <circle cx={302} cy={154} r={2.6} fill="#ef4444" />
        <circle cx={310} cy={154} r={2.6} fill="#f59e0b" />
        <circle cx={318} cy={154} r={2.6} fill="#22c55e" />
        <text x={460} y={157} textAnchor="end" className="lab-screen-title">
          your-app
        </text>
        {[
          ['201', 'POST /api/rfid/scan'],
          ['OK ', 'MID 0061 · 42.5 Nm'],
          ['ON ', 'DI03 proximity'],
          ['READ', 'D11 = 3 · D260 = 128'],
          ['201', 'POST /api/gate · 6 tags'],
        ].map(([a, b], k) => (
          <text key={k} x={302} y={176 + k * 15} className="lab-log">
            <tspan className="lab-log-ok">{a}</tspan> {b}
          </text>
        ))}
        <rect x={262} y={262} width={236} height={10} rx={3} className="lab-base" />
      </g>

      {NODES.map((n) => (
        <a key={n.id} href={href(`/simulators/${n.id}`)} className="lab-node">
          <rect x={n.x} y={n.y} width={TILE.w} height={TILE.h} rx={8} className="lab-tile" />
          <DeviceArt id={n.id} x={n.x + 4} y={n.y + 4} width={TILE.w - 8} height={104} />
          <text x={n.x + TILE.w / 2} y={n.y + TILE.h - 9} textAnchor="middle" className="lab-name">
            {SHORT[n.id]}
          </text>
        </a>
      ))}
    </svg>
  );
}
