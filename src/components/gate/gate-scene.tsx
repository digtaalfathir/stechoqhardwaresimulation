import { cloneElement, useEffect, useState, type ReactElement } from 'react';
import type { RfidReaderSimulator } from '../../simulators/rfid/rfid-reader';

/**
 * The gate, drawn in isometric: an 8-antenna portal over a lane, and a
 * forklift that drives a stack of RR through it while a pass runs. Everything
 * is computed from 3D coordinates (x along the lane toward the exit, y across
 * it, z up), so the forklift's position is just a number that moves.
 */

const S = 38;
const COS = Math.cos(Math.PI / 6);
const SIN = Math.sin(Math.PI / 6);
const OX = 480;
const OY = 315;
export const SCENE = { width: 960, height: 600 };

/** Lane width, gate height, gate position and depth. */
const W = 4.4;
const H = 4.8;
const G0 = 0;
const GT = 0.7;
/** One RR: depth along the lane and width across it. */
const RR_D = 1.6;
const RR_W = 2.3;
/** Where the forklift waits, and how far it drives off. */
const PARKED = -3.2;
const THROUGH = G0 + GT + RR_D + 0.4;
const GONE = 9;

type Pt = [number, number, number];
const project = ([x, y, z]: Pt) => [OX + (x - y) * COS * S, OY + (x + y) * SIN * S - z * S];
const points = (pts: Pt[]) => pts.map((p) => project(p).map((v) => v.toFixed(1)).join(',')).join(' ');

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** Collects shapes in painter's order. */
class Canvas {
  shapes: ReactElement[] = [];
  private k = 0;

  poly(pts: Pt[], fill: string, props: Record<string, unknown> = {}) {
    this.shapes.push(<polygon key={this.k++} points={points(pts)} fill={fill} {...props} />);
  }

  /** A box seen from the +x/+y/+z corner: its +y face, +x face and top. */
  box(x: number, y: number, z: number, w: number, d: number, h: number, color: string, props: Record<string, unknown> = {}) {
    this.poly([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]], shade(color, 0.86), props);
    this.poly([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]], shade(color, 0.72), props);
    this.poly([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]], shade(color, 1), props);
  }

  /** A circle standing in the x-z plane (a wheel seen from the side). */
  ring(cx: number, y: number, cz: number, r: number, fill: string) {
    const pts: Pt[] = [];
    for (let t = 0; t < Math.PI * 2; t += Math.PI / 10) pts.push([cx + r * Math.cos(t), y, cz + r * Math.sin(t)]);
    this.poly(pts, fill);
  }

  text(at: Pt, label: string, props: Record<string, unknown> = {}) {
    const [x, y] = project(at);
    this.shapes.push(
      <text key={this.k++} x={x} y={y} className="gt-svg-text" {...props}>
        {label}
      </text>,
    );
  }

  push(el: ReactElement) {
    this.shapes.push(cloneElement(el, { key: this.k++ }));
  }
}

type TagLook = 'now' | 'rep' | 'wait';

/** Where the front of the load is, for the current moment of the pass. */
function loadFront(sim: RfidReaderSimulator, now: number): number {
  const p = sim.state.pass;
  if (!p) return PARKED;
  const seg = (t0: number, t1: number, a: number, b: number) =>
    a + (b - a) * Math.min(1, Math.max(0, (now - t0) / Math.max(1, t1 - t0)));
  if (now < p.enterAt) return seg(p.startedAt, p.enterAt, PARKED, G0);
  if (now < p.leaveAt) return seg(p.enterAt, p.leaveAt, G0, THROUGH);
  return seg(p.leaveAt, p.endAt, THROUGH, GONE);
}

/** A point along the report's flight from the reader to the API card. */
function bezier(t: number, a: number[], c1: number[], c2: number[], b: number[]) {
  const u = 1 - t;
  return [0, 1].map((i) => u * u * u * a[i] + 3 * u * u * t * c1[i] + 3 * u * t * t * c2[i] + t * t * t * b[i]);
}

export function GateScene({ sim }: { sim: RfidReaderSimulator }) {
  const st = sim.state;
  const [now, setNow] = useState(Date.now());
  const moving = st.pass !== null;

  // Animate only while the forklift is moving; otherwise the scene is still.
  useEffect(() => {
    if (!moving) return;
    let id = 0;
    const tick = () => {
      setNow(Date.now());
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [moving]);

  const t = moving ? now : Date.now();
  const fx = loadFront(sim, t);
  const pass = st.pass;
  const inField = !!pass && t >= pass.enterAt - 200 && t <= pass.leaveAt + 600;
  const epcs = pass ? pass.epcs : sim.tags();
  const look = (epc: string): TagLook =>
    !pass ? 'wait' : st.readNow.includes(epc) ? 'now' : st.reported.includes(epc) ? 'rep' : 'wait';

  const c = new Canvas();

  // floor, lane, centre stripes, exit arrow
  c.poly([[-11, -1.6, 0], [10, -1.6, 0], [10, W + 1.6, 0], [-11, W + 1.6, 0]], '#e3e8ee', { className: 'gt-floor' });
  c.poly([[-11, 0, 0], [10, 0, 0], [10, W, 0], [-11, W, 0]], '#d6dde5', { className: 'gt-lane' });
  for (let x = -10.5; x < 10; x += 1.4) {
    c.poly([[x, W / 2 - 0.06, 0], [x + 0.7, W / 2 - 0.06, 0], [x + 0.7, W / 2 + 0.06, 0], [x, W / 2 + 0.06, 0]], '#f5c400');
  }
  for (const yy of [0, W]) c.poly([[-11, yy - 0.05, 0], [10, yy - 0.05, 0], [10, yy + 0.05, 0], [-11, yy + 0.05, 0]], '#9aa6b2');
  c.poly([[5.2, W / 2 - 0.5, 0], [6.4, W / 2, 0], [5.2, W / 2 + 0.5, 0], [5.5, W / 2, 0]], '#9aa6b2');

  // far pillar and its antennas (ANT 1-3, facing the lane)
  const pillar = '#aab4be';
  c.box(G0, -0.55, 0, GT, 0.55, H, pillar);
  const antenna = (z0: number, label: string) => {
    c.poly(
      [[G0 + 0.08, 0.001, z0], [G0 + GT - 0.08, 0.001, z0], [G0 + GT - 0.08, 0.001, z0 + 1.05], [G0 + 0.08, 0.001, z0 + 1.05]],
      inField ? '#e8f1fa' : '#f6f8fa',
      { stroke: inField ? '#1263a8' : '#b8c1cb', strokeWidth: 1.5 },
    );
    c.text([G0 + GT / 2, 0.001, z0 + 0.52], label, { textAnchor: 'middle', className: `gt-svg-text ant${inField ? ' on' : ''}` });
  };
  antenna(0.4, 'ANT 1');
  antenna(1.75, 'ANT 2');
  antenna(3.1, 'ANT 3');

  // the RF field across the portal, and ripples off the antennas
  if (inField) {
    c.poly([[G0 - 0.2, 0, 0.1], [G0 + GT + 0.2, 0, 0.1], [G0 + GT + 0.2, 0, H - 0.4], [G0 - 0.2, 0, H - 0.4]], 'rgba(18,99,168,0.08)');
    c.poly([[G0 + GT + 0.2, 0, 0.1], [G0 + GT + 0.2, W, 0.1], [G0 + GT + 0.2, W, H - 0.4], [G0 + GT + 0.2, 0, H - 0.4]], 'rgba(18,99,168,0.07)');
    for (const z0 of [0.4, 1.75, 3.1]) {
      [0.45, 0.9, 1.35].forEach((r, i) => {
        const pts: Pt[] = [];
        for (let a = -1.2; a <= 1.21; a += 0.2) pts.push([G0 + GT / 2 + r * Math.sin(a) * 0.5, r * Math.cos(a) * 0.9 + 0.05, z0 + 0.52 + r * Math.sin(a) * 0.35]);
        c.push(<polyline points={points(pts)} className="gt-ripple" style={{ animationDelay: `${i * 0.2}s` }} />);
      });
    }
  }

  const drawForklift = () => {
    const mastX = fx - RR_D - 0.25;
    // chassis, counterweight, hood
    c.box(mastX - 3.3, 0.85, 0.32, 3.15, 2.7, 0.9, '#f2b705');
    c.box(mastX - 3.6, 0.85, 0.32, 0.5, 2.7, 1.25, '#3d454e');
    c.box(mastX - 3.1, 1.0, 1.22, 1.45, 2.4, 0.3, '#e0a800');
    // cage, seat, steering
    for (const [px, py] of [[mastX - 2.9, 1.0], [mastX - 0.7, 1.0], [mastX - 2.9, 3.35], [mastX - 0.7, 3.35]]) {
      c.box(px, py, 1.22, 0.1, 0.1, 1.75, '#22272d');
    }
    c.box(mastX - 1.95, 1.6, 1.52, 0.6, 1.4, 0.45, '#22272d');
    c.box(mastX - 1.25, 2.1, 1.52, 0.12, 0.4, 0.75, '#22272d');
    c.box(mastX - 2.9, 1.0, 2.97, 2.3, 2.45, 0.08, '#2b3036');
    // mast, carriage, forks
    c.box(mastX, 1.05, 0.15, 0.2, 0.2, 4.1, '#4a525c');
    c.box(mastX, 3.15, 0.15, 0.2, 0.2, 4.1, '#4a525c');
    c.box(mastX, 1.05, 4.05, 0.2, 2.3, 0.15, '#4a525c');
    c.box(mastX + 0.2, 1.1, 0.2, 0.08, 2.2, 0.9, '#2b3036');
    c.box(mastX + 0.25, 1.25, 0.2, RR_D + 0.1, 0.25, 0.08, '#3d454e');
    c.box(mastX + 0.25, 2.9, 0.2, RR_D + 0.1, 0.25, 0.08, '#3d454e');
    for (const wx of [mastX - 2.75, mastX - 0.55]) {
      c.ring(wx, 3.56, 0.4, 0.4, '#1d2126');
      c.ring(wx, 3.57, 0.4, 0.17, '#8a96a3');
    }

    // the RR, one on top of the other
    const n = Math.max(epcs.length, 1);
    const layer = Math.min(0.22, 3.6 / n);
    const x0 = fx - RR_D;
    const y0 = W / 2 - RR_W / 2;
    epcs.forEach((epc, i) => {
      const z = 0.3 + i * layer;
      c.box(x0, y0, z, RR_D, RR_W, layer * 0.86, '#2f6fb3');
      const lk = look(epc);
      const a = 0.32;
      const b = Math.max(0.035, layer * 0.3);
      const cz = z + layer * 0.43;
      c.poly(
        [[x0 + RR_D / 2 - a, y0 + RR_W + 0.002, cz - b], [x0 + RR_D / 2 + a, y0 + RR_W + 0.002, cz - b], [x0 + RR_D / 2 + a, y0 + RR_W + 0.002, cz + b], [x0 + RR_D / 2 - a, y0 + RR_W + 0.002, cz + b]],
        lk === 'rep' ? '#2e9d5b' : lk === 'now' ? '#3aa0ff' : '#ffffff',
        {
          className: `gt-label ${lk}`,
          stroke: lk === 'rep' ? '#1f7a44' : lk === 'now' ? '#0d4f8c' : '#9aa3ad',
          strokeWidth: 0.8,
        },
      );
    });
  };

  const drawGateFront = () => {
    c.box(G0, W, 0, GT, 0.55, H, pillar);
    c.text([G0, W + 0.55, 0], 'ANT 4–6 ▸', { textAnchor: 'end', dx: -8, dy: 18 });
    c.box(G0, -0.55, H, GT, W + 1.1, 0.55, '#b9c2cc');
    for (const [yy, label] of [[W * 0.28, 'ANT 7'], [W * 0.62, 'ANT 8']] as [number, string][]) {
      c.poly(
        [[G0 + GT + 0.001, yy, H + 0.06], [G0 + GT + 0.001, yy + 0.9, H + 0.06], [G0 + GT + 0.001, yy + 0.9, H + 0.48], [G0 + GT + 0.001, yy, H + 0.48]],
        inField ? '#e8f1fa' : '#f6f8fa',
        { stroke: inField ? '#1263a8' : '#b8c1cb', strokeWidth: 1.5 },
      );
      c.text([G0 + GT, yy + 0.45, H + 0.24], label, { textAnchor: 'middle', dy: 3, className: `gt-svg-text ant${inField ? ' on' : ''}` });
    }
    // the reader and its display
    c.box(G0 - 0.05, W / 2 - 0.9, H + 0.55, 0.8, 1.8, 0.75, '#22272d');
    c.poly(
      [[G0 + 0.751, W / 2 - 0.75, H + 0.75], [G0 + 0.751, W / 2 + 0.75, H + 0.75], [G0 + 0.751, W / 2 + 0.75, H + 1.18], [G0 + 0.751, W / 2 - 0.75, H + 1.18]],
      '#0b2a1c',
    );
    c.text(
      [G0 + 0.75, W / 2, H + 0.97],
      pass ? `REPORT ${st.sweep} · ${st.covered}/${st.total}` : 'READY',
      { textAnchor: 'middle', className: 'gt-svg-text lcd' },
    );
  };

  // A forklift past the gate is in front of it; otherwise the gate's front is.
  if (fx - RR_D - 4 > G0 + GT) {
    drawGateFront();
    drawForklift();
  } else {
    drawForklift();
    drawGateFront();
  }

  // The latest report flies from the reader to the API card.
  const reader = project([G0 + 0.4, W / 2, H + 1.4]);
  const api = [SCENE.width - 250, 64];
  const c1 = [reader[0] + 60, Math.max(24, reader[1] - 110)];
  const c2 = [api[0] - 90, api[1] + 6];
  const last = st.sweeps[0];
  const age = last ? t - Date.parse(last.at) : Infinity;

  return (
    <svg className="gt-scene" viewBox={`0 0 ${SCENE.width} ${SCENE.height}`} role="img" aria-label="RFID gate with a forklift">
      <defs>
        <filter id="gt-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {c.shapes}
      <path
        d={`M ${reader[0]} ${reader[1]} C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${api[0]} ${api[1]}`}
        className="gt-link"
      />
      {age < 1400 && last && (() => {
        const [x, y] = bezier(age / 1400, reader, c1, c2, api);
        return (
          <g transform={`translate(${x} ${y})`}>
            <rect x={-42} y={-11} width={84} height={22} rx={11} className="gt-packet" />
            <text x={0} y={4} textAnchor="middle" className="gt-svg-text packet">
              POST · {last.fresh.length + last.again.length} tag
            </text>
          </g>
        );
      })()}
    </svg>
  );
}
