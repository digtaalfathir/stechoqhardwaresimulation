import type { TransportFrame, TransportResponse } from './types';

/**
 * Transport helpers.
 *
 * `postJson` really sends — it is how a device reports to your backend. The
 * other builders only render the frame a device would have put on the wire
 * (a browser cannot open a raw TCP or Modbus socket), and the workspace prints
 * whatever `TransportFrame.detail` contains, so live transports can be added
 * later without touching the UI.
 */

/**
 * Posts the body for real and reports what came back.
 *
 * Never throws: a blocked, refused or timed-out request is a result too, and the
 * whole point of the panel above it is to say which one happened.
 */
export async function postJson(url: string, body: unknown, timeoutMs = 15000): Promise<TransportResponse> {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      message: summarise(text),
      durationMs: Math.round(performance.now() - started),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      statusText: '',
      message: '',
      durationMs: Math.round(performance.now() - started),
      ...explain(err, url, timeoutMs),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Pull the human-readable part out of a response body. */
function summarise(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    for (const key of ['message', 'detail', 'error', 'msg', 'status']) {
      const value = parsed?.[key];
      if (typeof value === 'string' && value) return value;
    }
    return JSON.stringify(parsed);
  } catch {
    return trimmed.slice(0, 500);
  }
}

/**
 * `fetch` reports every network-level refusal as the same opaque TypeError, so
 * name the causes the user can actually act on.
 */
function explain(err: unknown, url: string, timeoutMs: number): Partial<TransportResponse> {
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  })();
  const seconds = Math.round(timeoutMs / 1000);

  if (err instanceof DOMException && err.name === 'AbortError') {
    return {
      errorCode: 'timeout',
      host,
      timeoutSeconds: seconds,
      error: `No response within ${seconds}s — the server did not answer.`,
    };
  }
  const page = typeof location !== 'undefined' ? location.protocol : 'http:';
  if (page === 'https:' && url.startsWith('http://')) {
    return {
      errorCode: 'mixed-content',
      host,
      error:
        'Blocked: this page is served over HTTPS and the endpoint is HTTP (mixed content). Use an HTTPS endpoint, or run the simulator locally over HTTP.',
    };
  }
  return {
    errorCode: 'unreachable',
    host,
    error: `Could not reach ${host}. The browser blocked the request or the host is unreachable — check that the server is running and that it returns CORS headers (Access-Control-Allow-Origin) for this page.`,
  };
}

/** Renders a response the way a client would print it, below the request. */
export function withResponse(frame: TransportFrame, res: TransportResponse): TransportFrame {
  const body = res.error
    ? ['--- no response ---', res.error]
    : [`HTTP/1.1 ${res.status} ${res.statusText}`.trim(), '', res.message || '(empty body)'];
  return {
    ...frame,
    live: true,
    response: res,
    summary: res.error
      ? `${frame.summary} → failed`
      : `${frame.summary} → ${res.status} ${res.statusText}`.trim(),
    detail: [frame.detail, '', ...body, '', `elapsed ${res.durationMs} ms`].join('\n'),
  };
}

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
  ].join('\n');
  return { protocol: 'REST', direction: 'outbound', summary: `POST ${url || path}`, detail };
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
