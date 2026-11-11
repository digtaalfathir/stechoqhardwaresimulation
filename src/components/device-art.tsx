import { useId, type ReactNode, type SVGProps } from 'react';

/**
 * Small illustrations of each simulator, drawn in the same style as its
 * workspace so a card already shows the device you will get. 320 × 200 each;
 * nest them in another SVG with x / y / width / height.
 */
export function DeviceArt({ id, ...svg }: { id: string } & SVGProps<SVGSVGElement>) {
  const uid = useId().replace(/:/g, '');
  const draw = ART[id];
  return (
    <svg viewBox="0 0 320 200" className="device-art" aria-hidden="true" focusable="false" {...svg}>
      <defs>
        <linearGradient id={`${uid}m`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8b949d" />
          <stop offset=".45" stopColor="#e6e9ec" />
          <stop offset="1" stopColor="#7e8790" />
        </linearGradient>
        <linearGradient id={`${uid}g`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#cfd4d9" />
          <stop offset=".5" stopColor="#e8ebee" />
          <stop offset="1" stopColor="#c9ced3" />
        </linearGradient>
        <linearGradient id={`${uid}d`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3d434b" />
          <stop offset="1" stopColor="#1b1f24" />
        </linearGradient>
        <filter id={`${uid}b`} x="-1" y="-1" width="3" height="3">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>
      {draw ? draw({ metal: `url(#${uid}m)`, grey: `url(#${uid}g)`, dark: `url(#${uid}d)`, blur: `url(#${uid}b)` }) : null}
    </svg>
  );
}

type Paint = { metal: string; grey: string; dark: string; blur: string };

const ART: Record<string, (p: Paint) => ReactNode> = {
  'rfid-handheld': (p) => (
    <>
      <rect x="0" y="182" width="320" height="18" className="art-floor" />
      {/* the beam, WiFi-style, aimed down-right */}
      {[0, 1, 2].map((k) => (
        <path
          key={k}
          d={`M${132 + k * 22} ${58 - k * 10} a${46 + k * 30} ${46 + k * 30} 0 0 1 ${10 + k * 18} ${70 + k * 46}`}
          className="art-beam art-pulse"
          style={{ animationDelay: `${k * 0.35}s` }}
        />
      ))}
      {/* tags on the bench */}
      {[
        [204, 104, -8, true],
        [246, 140, 6, true],
        [276, 92, -4, false],
        [214, 158, 10, false],
      ].map(([x, y, r, read], i) => (
        <g key={i} transform={`rotate(${r} ${x} ${y})`}>
          {read && <rect x={Number(x) - 21} y={Number(y) - 11} width="42" height="22" rx="4" fill="#22c55e" opacity=".45" filter={p.blur} />}
          <rect x={Number(x) - 18} y={Number(y) - 9} width="36" height="18" rx="2" fill="#f8fafc" stroke="#9aa3ad" />
          <rect x={Number(x) - 12} y={Number(y) - 5} width="18" height="10" fill="none" stroke="#b08d2c" strokeWidth="1.2" />
          <rect x={Number(x) + 9} y={Number(y) - 2} width="4" height="4" fill="#3a4048" />
        </g>
      ))}
      {/* the MC3300 */}
      <g transform="rotate(-6 80 110)">
        <rect x="40" y="22" width="80" height="34" rx="10" fill="#3a4048" />
        <rect x="52" y="28" width="56" height="12" rx="4" fill="#23282d" />
        <rect x="44" y="44" width="72" height="140" rx="12" fill={p.dark} />
        <rect x="52" y="56" width="56" height="62" rx="2" fill="#f8fafc" />
        <rect x="52" y="56" width="56" height="10" fill="#1565c0" />
        <rect x="56" y="72" width="34" height="4" rx="1" fill="#cbd5e1" />
        <rect x="56" y="80" width="46" height="8" rx="1" fill="#e8f6ee" stroke="#86d1a7" strokeWidth=".6" />
        <rect x="56" y="91" width="46" height="8" rx="1" fill="#e8f6ee" stroke="#86d1a7" strokeWidth=".6" />
        <rect x="56" y="104" width="46" height="9" rx="2" fill="#1565c0" />
        {Array.from({ length: 12 }, (_, k) => (
          <rect key={k} x={55 + (k % 3) * 17} y={126 + Math.floor(k / 3) * 12} width="14" height="8" rx="2" fill="#4a525c" />
        ))}
        <rect x="114" y="84" width="9" height="28" rx="3" fill="#f2c318" />
        <rect x="37" y="84" width="9" height="28" rx="3" fill="#f2c318" />
      </g>
    </>
  ),

  'rfid-reader': (p) => (
    <>
      <rect x="0" y="182" width="320" height="18" className="art-floor" />
      <rect x="62" y="40" width="196" height="142" className="art-field art-pulse" />
      {/* the forklift and its stack, driving through */}
      <g className="art-drive">
        <rect x="102" y="76" width="4" height="106" fill="#4b525a" />
        {Array.from({ length: 10 }, (_, k) => (
          <rect key={k} x="60" y={84 + k * 9} width="40" height="7" rx="1" fill="#2563eb" stroke="#1e40af" strokeWidth=".6" />
        ))}
        <rect x="56" y="176" width="50" height="4" fill="#3a4048" />
        <rect x="108" y="128" width="58" height="44" rx="4" fill="#f59e0b" />
        <rect x="118" y="98" width="38" height="32" fill="none" stroke="#3a4048" strokeWidth="3" />
        <rect x="150" y="140" width="22" height="22" rx="3" fill="#d97706" />
        <circle cx="124" cy="176" r="8" fill="#23282d" />
        <circle cx="156" cy="176" r="8" fill="#23282d" />
      </g>
      {/* portal: two posts, a beam, eight antennas */}
      <rect x="48" y="24" width="14" height="158" fill={p.metal} />
      <rect x="258" y="24" width="14" height="158" fill={p.metal} />
      <rect x="44" y="18" width="232" height="16" rx="2" fill="#9aa3ad" />
      {[52, 92, 132].map((y) => (
        <g key={y}>
          <rect x="62" y={y} width="12" height="30" rx="2" fill="#f1f4f6" stroke="#9aa3ad" />
          <rect x="246" y={y} width="12" height="30" rx="2" fill="#f1f4f6" stroke="#9aa3ad" />
        </g>
      ))}
      <rect x="116" y="34" width="34" height="10" rx="2" fill="#f1f4f6" stroke="#9aa3ad" />
      <rect x="170" y="34" width="34" height="10" rx="2" fill="#f1f4f6" stroke="#9aa3ad" />
      <circle cx="268" cy="28" r="3" fill="#22c55e" className="art-blink" />
    </>
  ),

  nutrunner: (p) => (
    <>
      <rect x="0" y="182" width="320" height="18" className="art-floor" />
      <rect x="140" y="14" width="168" height="6" rx="3" fill="#9aa3ad" />
      <rect x="208" y="18" width="24" height="12" rx="2" fill="#f2c318" />
      <line x1="220" y1="30" x2="220" y2="48" stroke="#5c656e" strokeWidth="2" strokeDasharray="2 2" />
      <path d="M112 128 C150 128, 170 52, 210 66" fill="none" stroke="#1d2126" strokeWidth="4" strokeLinecap="round" />
      {/* controller, CVI3-style, no logo */}
      <rect x="20" y="28" width="12" height="148" rx="3" fill="#5b636b" />
      <rect x="30" y="26" width="84" height="152" rx="7" fill="#23272c" />
      <rect x="33" y="30" width="2" height="144" fill="#c62828" />
      <rect x="109" y="30" width="2" height="144" fill="#c62828" />
      <rect x="40" y="38" width="64" height="58" rx="2" fill="#f4f6f8" />
      <rect x="40" y="38" width="64" height="9" fill="#1565c0" />
      <rect x="44" y="51" width="56" height="18" rx="1" fill="#bbf7d0" />
      <rect x="44" y="72" width="56" height="18" rx="1" fill="#bbf7d0" />
      <rect x="47" y="56" width="26" height="7" rx="1" fill="#14532d" />
      <rect x="47" y="77" width="18" height="7" rx="1" fill="#14532d" />
      <circle cx="62" cy="108" r="5" fill="#2d3238" stroke="#c62828" />
      <circle cx="82" cy="108" r="5" fill="#2d3238" stroke="#c62828" />
      <rect x="38" y="122" width="68" height="48" rx="3" fill="#9b1c1c" />
      <circle cx="72" cy="146" r="13" fill="none" stroke="#e5a3a3" strokeWidth="1.2" />
      <rect x="26" y="96" width="3" height="30" rx="1" fill="#22c55e" className="art-blink" />
      {/* the tool on its balancer */}
      <rect x="208" y="48" width="24" height="12" rx="3" fill="#3a4048" />
      <rect x="206" y="60" width="28" height="5" fill="#c62828" />
      <rect x="206" y="65" width="28" height="64" rx="7" fill={p.dark} />
      <rect x="203" y="80" width="5" height="18" rx="2" fill="#b91c1c" />
      <rect x="208" y="116" width="24" height="5" rx="2" fill="#22c55e" className="art-pulse" />
      <rect x="215" y="129" width="10" height="24" fill={p.metal} />
      <rect x="212" y="151" width="16" height="10" rx="1" fill="#6b747d" />
      {/* workpiece and bolts */}
      <rect x="146" y="164" width="164" height="16" rx="3" fill={p.grey} stroke="#9aa3ad" />
      {[166, 194, 220, 248, 276].map((x, i) => (
        <circle
          key={x}
          cx={x}
          cy="172"
          r="6"
          fill="#cfd5db"
          stroke={i < 2 ? '#16a34a' : i === 2 ? '#2563eb' : '#7d868f'}
          strokeWidth="2.4"
        />
      ))}
    </>
  ),

  'digital-io': (p) => (
    <>
      <rect x="0" y="182" width="320" height="18" className="art-floor" />
      <rect x="10" y="96" width="300" height="10" fill={p.metal} />
      {/* wires */}
      <path d="M266 52 C266 34, 150 30, 150 44" fill="none" stroke="#16a34a" strokeWidth="2.4" />
      <path d="M44 120 C44 174, 120 174, 120 156" fill="none" stroke="#e08a00" strokeWidth="2.4" />
      <path d="M276 140 C276 176, 196 176, 196 156" fill="none" stroke="#8d97a2" strokeWidth="2.4" />
      {/* the box: ESP32 + W5500 behind a window */}
      <rect x="96" y="52" width="128" height="96" rx="6" fill={p.grey} stroke="#a6adb4" />
      <rect x="100" y="42" width="120" height="16" rx="2" fill="#2f6e47" />
      <rect x="100" y="142" width="120" height="16" rx="2" fill="#2f6e47" />
      {Array.from({ length: 7 }, (_, k) => (
        <g key={k}>
          <circle cx={110 + k * 16.6} cy="48" r="3" fill={p.metal} />
          <circle cx={110 + k * 16.6} cy="152" r="3" fill={p.metal} />
          <circle cx={110 + k * 16.6} cy="68" r="2.6" fill={k === 1 || k === 4 ? '#22c55e' : '#9aa3ab'} className={k === 4 ? 'art-blink' : undefined} />
          <circle cx={110 + k * 16.6} cy="132" r="2.6" fill={k === 0 || k === 3 ? '#f59e0b' : '#9aa3ab'} />
        </g>
      ))}
      <rect x="104" y="78" width="112" height="44" rx="3" fill="#1a2620" stroke="#5f6870" />
      <rect x="109" y="83" width="50" height="34" rx="2" fill="#1d1f22" />
      <rect x="130" y="89" width="22" height="22" rx="1" fill="#c9ced3" />
      <rect x="166" y="83" width="45" height="34" rx="2" fill="#1b4f8f" />
      <rect x="172" y="93" width="13" height="13" fill="#15181b" />
      <rect x="192" y="88" width="17" height="24" rx="1" fill="#c4c9ce" />
      <path d="M224 100 C 250 100, 270 80, 320 80" fill="none" stroke="#2f6fd0" strokeWidth="4" strokeLinecap="round" />
      {/* a push button, a stack light, a motor */}
      <rect x="250" y="52" width="32" height="34" rx="4" fill="#c9ced4" stroke="#9aa2aa" />
      <circle cx="266" cy="69" r="10" fill="#22a559" stroke="#0f6b37" />
      <rect x="36" y="34" width="16" height="8" rx="4" fill="#3a4048" />
      <rect x="35" y="42" width="18" height="16" fill="#5f2a27" />
      <rect x="35" y="58" width="18" height="16" fill="#5f4b22" />
      <rect x="35" y="74" width="18" height="16" fill="#22c55e" />
      <rect x="31" y="72" width="26" height="20" fill="#22c55e" opacity=".5" filter={p.blur} />
      <rect x="41" y="90" width="6" height="30" fill="#4b525a" />
      <rect x="252" y="118" width="44" height="30" rx="5" fill="#4a6fa5" />
      <g transform="translate(304 133)">
        <g className="art-spin">
          <circle r="8" fill="#d7dce1" stroke="#7d868f" />
          <path d="M0 -7 L2 0 L0 7 L-2 0 Z M-7 0 L0 2 L7 0 L0 -2 Z" fill="#6b747d" />
        </g>
      </g>
    </>
  ),

  plc: (p) => (
    <>
      <rect x="0" y="182" width="320" height="18" className="art-floor" />
      <rect x="10" y="26" width="300" height="146" rx="4" className="art-plate" />
      <rect x="18" y="40" width="284" height="122" rx="2" fill="#aeb5bc" />
      {/* power, CPU, Ethernet, then I/O modules */}
      {[
        [22, 44, 'pwr'],
        [68, 32, 'cpu'],
        [102, 30, 'eth'],
        [134, 30, 'io'],
        [166, 30, 'io'],
        [198, 30, 'io'],
        [230, 30, 'io'],
        [262, 36, 'io'],
      ].map(([x, w, kind], i) => {
        const xx = Number(x);
        const ww = Number(w);
        return (
          <g key={i}>
            <rect x={xx} y="44" width={ww - 2} height="114" rx="2" fill={p.grey} stroke="#9aa1a8" />
            <rect x={xx + 3} y="50" width={ww - 8} height="22" rx="1" fill="#1b1e22" />
            {kind === 'pwr' && <circle cx={xx + 10} cy="61" r="2.6" fill="#22c55e" />}
            {kind === 'cpu' && (
              <>
                <circle cx={xx + 9} cy="57" r="2.2" fill="#22c55e" className="art-blink" />
                <circle cx={xx + 9} cy="65" r="2.2" fill="#4b5563" />
                <circle cx={xx + 20} cy="57" r="2.2" fill="#22c55e" />
              </>
            )}
            {kind === 'eth' && (
              <>
                <circle cx={xx + 9} cy="57" r="2.2" fill="#22c55e" />
                <circle cx={xx + 19} cy="57" r="2.2" fill="#f59e0b" className="art-blink" />
                <rect x={xx + 7} y="128" width="14" height="12" rx="1" fill="#2a2e33" />
              </>
            )}
            {kind === 'io' &&
              Array.from({ length: 8 }, (_, k) => (
                <rect
                  key={k}
                  x={xx + 6 + (k % 4) * 5.4}
                  y={54 + Math.floor(k / 4) * 8}
                  width="3.4"
                  height="3.4"
                  fill={(k + i) % 3 === 0 ? '#f87171' : '#4b5563'}
                  className={(k + i) % 5 === 0 ? 'art-blink' : undefined}
                  style={{ animationDelay: `${(k * 0.17).toFixed(2)}s` }}
                />
              ))}
            {kind === 'pwr' && <rect x={xx + 6} y="118" width={ww - 14} height="30" rx="2" fill="#9aa1a8" />}
            {kind === 'cpu' && <rect x={xx + 6} y="84" width={ww - 14} height="14" rx="1" fill="#c3c9cf" />}
            {kind === 'io' && <rect x={xx + 3} y="82" width={ww - 8} height="70" rx="2" fill="#5b636b" />}
            <rect x={xx + 3} y="74" width={ww - 8} height="4" fill="#e2692a" />
          </g>
        );
      })}
      <path d="M116 140 C116 190, 220 176, 320 186" fill="none" stroke="#2f6fd0" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
};
