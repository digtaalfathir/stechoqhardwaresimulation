import type { TransportFrame } from './types';

/**
 * Builders for the "what would have gone on the wire" view.
 * These render frames only — nothing here opens a socket. Real transports
 * (WebSocket / MQTT / TCP) can be added as further builders without the UI
 * changing, because the workspace just prints TransportFrame.detail.
 */

export function httpPost(url: string, body: unknown): TransportFrame {
  const json = JSON.stringify(body, null, 2);
  let host = 'localhost';
  let path = url || '/';
  try {
    const parsed = new URL(url);
    host = parsed.host;
    path = parsed.pathname + parsed.search;
  } catch {
    /* endpoint typed as a bare path — keep the defaults */
  }
  const detail = [
    `POST ${path} HTTP/1.1`,
    `Host: ${host}`,
    'Content-Type: application/json',
    `Content-Length: ${new TextEncoder().encode(json).length}`,
    '',
    json,
    '',
    '--- simulated response ---',
    'HTTP/1.1 202 Accepted',
    'Content-Type: application/json',
    '',
    '{ "accepted": true }',
  ].join('\n');
  return { protocol: 'REST', direction: 'outbound', summary: `POST ${url || path} → 202`, detail };
}

export function mqttPublish(topic: string, body: unknown): TransportFrame {
  const json = JSON.stringify(body, null, 2);
  return {
    protocol: 'MQTT',
    direction: 'outbound',
    summary: `PUBLISH ${topic} (qos 0)`,
    detail: [`PUBLISH  topic=${topic}  qos=0  retain=false`, '', json].join('\n'),
  };
}

export function tcpFrame(host: string, port: number, text: string): TransportFrame {
  const bytes = new TextEncoder().encode(text);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
  return {
    protocol: 'TCP',
    direction: 'outbound',
    summary: `${host}:${port} ← ${bytes.length} bytes`,
    detail: [`TX ${host}:${port}  ${bytes.length} bytes`, '', text, '', 'hex:', wrap(hex, 71)].join('\n'),
  };
}

export function modbusWrite(
  host: string,
  port: number,
  fn: string,
  address: number,
  value: number,
): TransportFrame {
  return {
    protocol: 'Modbus TCP',
    direction: 'outbound',
    summary: `${fn} @ ${address} = ${value}`,
    detail: [
      `unit 1  ${fn}`,
      `address   ${address} (0x${address.toString(16).toUpperCase().padStart(4, '0')})`,
      `value     ${value}`,
      `target    ${host}:${port}`,
      '',
      '--- simulated response ---',
      `echo address=${address} value=${value}`,
    ].join('\n'),
  };
}

function wrap(text: string, width: number): string {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += width) out.push(text.slice(i, i + width));
  return out.join('\n');
}

// --- value generators ------------------------------------------------------

const HEX = '0123456789ABCDEF';

/** 24-char EPC Gen2 style hex id, e.g. E28068940000501234567890. */
export function randomEpc(): string {
  let out = 'E2806894';
  for (let i = 0; i < 16; i++) out += HEX[Math.floor(Math.random() * 16)];
  return out;
}

export function randomSerial(prefix: string, digits = 6): string {
  const n = Math.floor(Math.random() * 10 ** digits);
  return `${prefix}${String(n).padStart(digits, '0')}`;
}

/** Gaussian-ish jitter without pulling in a stats library. */
export function jitter(spread: number): number {
  return (Math.random() + Math.random() - 1) * spread;
}

export function round(value: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
