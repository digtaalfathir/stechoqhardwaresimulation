#!/usr/bin/env node
/**
 * MC Protocol PLC bridge — the part of the PLC simulator a browser cannot be.
 *
 * Your acquisition program connects here over TCP exactly as it would to a
 * Mitsubishi PLC (3E frame, binary, batch word read 0401 / write 1401, Q and
 * iQ-R sub-commands). The web workspace edits and watches the register memory
 * over a small HTTP API.
 *
 * Served by the website itself (/mc-plc.mjs), so a visitor runs it with one
 * command and needs nothing else — no repo, no npm install, no server:
 *
 *   node mc-plc.mjs                     then open the PLC workspace; the first PLC is localhost:8200
 *   node mc-plc.mjs --check             self-check of the frame codec
 *   MC_PORTS=8200-8299 HTTP_PORT=8201 PUBLIC_HOST=plc.example.com node mc-plc.mjs
 *
 * Every browser tab gets its own PLC — its own memory and its own TCP port from
 * the pool — because MC Protocol carries nothing that could tell two sessions
 * apart, but the port the client dials does. That is also what lets one hosted
 * copy serve many people, if it is ever run on a shared server.
 *
 * Zero dependencies on purpose. Plain Node 14+; no TypeScript, no build.
 */
import net from 'node:net';
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const [PORT_MIN, PORT_MAX] = (process.env.MC_PORTS || '8200-8299').split('-').map(Number);
const HTTP_PORT = Number(process.env.HTTP_PORT || 8201);
/** Host name your program dials; the workspace falls back to the bridge URL's host. */
const PUBLIC_HOST = process.env.PUBLIC_HOST || null;
/** A session nobody has looked at for this long is closed and its port freed. */
const IDLE_MS = Number(process.env.SESSION_IDLE_MIN || 30) * 60_000;

const LOG_MAX = 500;
const CELLS_MAX = 4096; // per session, so one client sweeping D0-D9999 cannot eat the server
const BODY_MAX = 64 * 1024;

// Word devices only. W is numbered in hex on a real PLC, D and R in decimal.
// ponytail: bit devices (M, X, Y) and ZR are not served; add a row here and a
// bit-packing branch in handle() when a client actually reads them.
const DEVICES = { 0xa8: 'D', 0xaf: 'R', 0xb4: 'W' };
const HEX_DEVICES = new Set(['W']);

// End codes a real CPU answers with.
const END = { OK: 0x0000, BAD_COUNT: 0xc051, BAD_DEVICE: 0xc056, BAD_COMMAND: 0xc059 };

// --- memory ------------------------------------------------------------------

const toInt16 = (v) => ((((Math.trunc(v) + 32768) % 65536) + 65536) % 65536) - 32768;
const deviceKey = (dev, no) => `${dev}${HEX_DEVICES.has(dev) ? no.toString(16).toUpperCase() : no}`;

/** memory: key -> { value, reads, writes, lastRead, lastWrite } ; value is signed int16. */
function cell(memory, key, create = true) {
  let c = memory.get(key);
  if (!c && create && memory.size < CELLS_MAX) {
    memory.set(key, (c = { value: 0, reads: 0, writes: 0, lastRead: null, lastWrite: null }));
  }
  return c;
}

/** Parses "D11", "w1a", "R 5" into a canonical key, or null. */
export function parseKey(text) {
  const m = /^\s*([DRW])\s*([0-9A-F]+)\s*$/i.exec(String(text));
  if (!m) return null;
  const dev = m[1].toUpperCase();
  const no = parseInt(m[2], HEX_DEVICES.has(dev) ? 16 : 10);
  return Number.isFinite(no) ? deviceKey(dev, no) : null;
}

// --- frame codec -------------------------------------------------------------

const hex = (buf) => buf.toString('hex').toUpperCase().replace(/(..)(?!$)/g, '$1 ');

/** Answers one complete 3E binary request against one session's memory. */
export function handle(memory, req, now = new Date().toISOString()) {
  const command = req.readUInt16LE(11);
  const sub = req.readUInt16LE(13);
  const iqr = sub === 0x0002;
  const info = { op: 'error', device: null, count: 0, values: [], end: END.OK };

  const fail = (end) => {
    info.end = end;
    // Error data: the access route and command that failed, 9 bytes.
    const body = Buffer.concat([req.subarray(2, 7), req.subarray(11, 15)]);
    return { res: frame(req, end, body), info };
  };

  if ((command !== 0x0401 && command !== 0x1401) || (sub !== 0x0000 && sub !== 0x0002)) {
    return fail(END.BAD_COMMAND);
  }
  const countAt = iqr ? 21 : 19;
  if (req.length < countAt + 2) return fail(END.BAD_COMMAND);

  const no = iqr ? req.readUInt32LE(15) : req.readUIntLE(15, 3);
  const code = iqr ? req.readUInt16LE(19) : req.readUInt8(18);
  const count = req.readUInt16LE(countAt);
  const dev = DEVICES[code];
  info.count = count;
  if (!dev) return fail(END.BAD_DEVICE);
  info.device = deviceKey(dev, no);
  if (count < 1 || count > 960) return fail(END.BAD_COUNT);

  const keys = Array.from({ length: count }, (_, i) => deviceKey(dev, no + i));

  if (command === 0x0401) {
    info.op = 'read';
    const data = Buffer.alloc(count * 2);
    keys.forEach((k, i) => {
      const c = cell(memory, k);
      if (c) {
        c.reads++;
        c.lastRead = now;
      }
      const v = c ? c.value : 0;
      data.writeInt16LE(v, i * 2);
      info.values.push(v);
    });
    return { res: frame(req, END.OK, data), info };
  }

  info.op = 'write';
  const dataAt = countAt + 2;
  if (req.length < dataAt + count * 2) return fail(END.BAD_COUNT);
  keys.forEach((k, i) => {
    const v = req.readInt16LE(dataAt + i * 2);
    const c = cell(memory, k);
    if (c) {
      c.value = v;
      c.writes++;
      c.lastWrite = now;
    }
    info.values.push(v);
  });
  return { res: frame(req, END.OK, Buffer.alloc(0)), info };
}

/** Response: subheader D000, echoed access route, length, end code, data. */
function frame(req, end, data) {
  const head = Buffer.alloc(11);
  head.writeUInt16BE(0xd000, 0);
  req.copy(head, 2, 2, 7);
  head.writeUInt16LE(2 + data.length, 7);
  head.writeUInt16LE(end, 9);
  return Buffer.concat([head, data]);
}

// --- sessions: one PLC each --------------------------------------------------

/** id -> session */
const sessions = new Map();
const portsInUse = () => new Set([...sessions.values()].map((s) => s.port));

function record(s, entry) {
  s.log.push({ seq: ++s.seq, at: new Date().toISOString(), ...entry });
  if (s.log.length > LOG_MAX) s.log.shift();
}

const peer = (sock) => `${sock.remoteAddress?.replace(/^::ffff:/, '')}:${sock.remotePort}`;

/**
 * mode online  answers every request
 *      silent  accepts connections but never answers (client read timeouts)
 *      offline stops listening and drops every client (connection refused)
 */
function mcServer(s) {
  return net.createServer((sock) => {
    const client = peer(sock);
    s.sockets.add(sock);
    record(s, { op: 'connect', client });
    let pending = Buffer.alloc(0);

    // TCP is a stream: a request may arrive split or several at once, so frames
    // are cut by their own length field (offset 7, counts the bytes after it).
    sock.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 9) {
        const total = 9 + pending.readUInt16LE(7);
        if (pending.readUInt16BE(0) !== 0x5000 || total > 8192) {
          record(s, { op: 'error', client, note: `not a 3E binary request: ${hex(pending.subarray(0, 16))}` });
          sock.destroy();
          return;
        }
        if (pending.length < total) return;
        const req = pending.subarray(0, total);
        pending = pending.subarray(total);
        if (s.mode === 'silent') {
          record(s, { op: 'ignored', client, req: hex(req) });
          continue;
        }
        const { res, info } = handle(s.memory, req);
        sock.write(res);
        record(s, { ...info, client, req: hex(req), res: hex(res) });
      }
    });
    sock.on('close', () => {
      s.sockets.delete(sock);
      record(s, { op: 'disconnect', client });
    });
    sock.on('error', () => {});
  });
}

const listen = (server, port) =>
  new Promise((resolve) => {
    const onError = () => resolve(false);
    server.once('error', onError);
    server.listen(port, () => {
      server.off('error', onError);
      resolve(true);
    });
  });

function stopListening(s) {
  s.server.close();
  for (const sock of s.sockets) sock.destroy();
}

/** Takes the wished-for port when it is free (a reload keeps its port), else the first free one. */
async function createSession(wish) {
  const taken = portsInUse();
  const candidates = [];
  if (wish >= PORT_MIN && wish <= PORT_MAX && !taken.has(wish)) candidates.push(wish);
  for (let p = PORT_MIN; p <= PORT_MAX; p++) if (!taken.has(p) && p !== wish) candidates.push(p);

  const s = { id: randomUUID(), port: 0, mode: 'online', memory: new Map(), sockets: new Set(), log: [], seq: 0, seen: Date.now() };
  s.server = mcServer(s);
  for (const port of candidates) {
    if (port === HTTP_PORT) continue;
    if (await listen(s.server, port)) {
      s.port = port;
      sessions.set(s.id, s);
      console.log(`session ${s.id.slice(0, 8)} → MC on ${port} (${sessions.size} open)`);
      return s;
    }
  }
  return null;
}

function closeSession(s) {
  stopListening(s);
  sessions.delete(s.id);
  console.log(`session ${s.id.slice(0, 8)} closed, port ${s.port} free (${sessions.size} open)`);
}

setInterval(() => {
  for (const s of sessions.values()) if (Date.now() - s.seen > IDLE_MS) closeSession(s);
}, 60_000).unref();

async function setMode(s, next) {
  if (!['online', 'silent', 'offline'].includes(next) || next === s.mode) return true;
  if (next === 'offline') stopListening(s);
  else if (s.mode === 'offline' && !(await listen(s.server, s.port))) return false;
  s.mode = next;
  record(s, { op: 'mode', note: next });
  return true;
}

/** { "D11": 3, "D260": null } — null forgets the register. */
function setRegisters(s, patch) {
  const changed = [];
  for (const [text, v] of Object.entries(patch ?? {})) {
    const key = parseKey(text);
    if (!key) continue;
    if (v === null) {
      s.memory.delete(key);
      continue;
    }
    const n = Number(v);
    const c = Number.isFinite(n) && cell(s.memory, key);
    if (!c) continue;
    c.value = toInt16(n);
    changed.push(`${key}=${c.value}`);
  }
  if (changed.length) record(s, { op: 'set', note: changed.join(' ') });
}

function view(s, since) {
  return {
    session: s.id,
    mode: s.mode,
    mcPort: s.port,
    mcHost: PUBLIC_HOST,
    clients: [...s.sockets].map(peer),
    registers: Object.fromEntries(s.memory),
    log: s.log.filter((e) => e.seq > since),
    seq: s.seq,
  };
}

// --- HTTP side (the web workspace) -------------------------------------------
//
//   POST /sessions                 { port? }       -> new session (its own PLC)
//   GET  /sessions/:id/state?since=N               -> memory, clients, new log lines
//   POST /sessions/:id/registers   { D11: 3 }      -> set registers
//   POST /sessions/:id/mode        { mode }        -> online | silent | offline

const httpServer = http.createServer((req, res) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    // Lets an HTTPS page reach a bridge on localhost or the LAN.
    'Access-Control-Allow-Private-Network': 'true',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
  const send = (status, body) => {
    res.writeHead(status, headers);
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  if (req.method === 'OPTIONS') return send(204);

  const url = new URL(req.url, 'http://x');
  const [, root, id, action] = url.pathname.split('/');
  if (root !== 'sessions') return send(404, { error: 'not found' });

  const s = id ? sessions.get(id) : null;
  if (id && !s) return send(404, { error: 'session expired or unknown' });
  if (s) s.seen = Date.now();

  if (req.method === 'GET' && action === 'state') {
    return send(200, view(s, Number(url.searchParams.get('since')) || 0));
  }
  if (req.method !== 'POST') return send(404, { error: 'not found' });

  let body = '';
  req.on('data', (c) => {
    body += c;
    if (body.length > BODY_MAX) req.destroy();
  });
  req.on('end', async () => {
    let json;
    try {
      json = JSON.parse(body || '{}');
    } catch {
      return send(400, { error: 'body is not JSON' });
    }
    if (!id) {
      const created = await createSession(Number(json.port));
      if (!created) return send(503, { error: `all ${PORT_MAX - PORT_MIN + 1} PLC ports are in use, try again later` });
      return send(201, view(created, 0));
    }
    if (action === 'registers') setRegisters(s, json);
    else if (action === 'mode') {
      if (!(await setMode(s, json.mode))) return send(409, { error: `port ${s.port} could not be reopened` });
    } else return send(404, { error: 'not found' });
    send(200, { ok: true, mode: s.mode });
  });
});

// --- self-check --------------------------------------------------------------

/** Builds a request the way node-mc_protocol's MessageBuilder does. */
function request(command, model, no, count, values = []) {
  const iqr = model === 'iQ-R';
  const dev = Buffer.alloc(iqr ? 6 : 4);
  if (iqr) {
    dev.writeUInt32LE(no, 0);
    dev.writeUInt16LE(0xa8, 4);
  } else {
    dev.writeUIntLE(no, 0, 3);
    dev.writeUInt8(0xa8, 3);
  }
  const body = Buffer.concat([
    Buffer.from([0x10, 0x00, command & 0xff, command >> 8, iqr ? 0x02 : 0x00, 0x00]),
    dev,
    Buffer.from([count & 0xff, count >> 8]),
    Buffer.from(values.flatMap((v) => [v & 0xff, (v >> 8) & 0xff])),
  ]);
  const len = Buffer.alloc(2);
  len.writeUInt16LE(body.length);
  return Buffer.concat([Buffer.from([0x50, 0x00, 0x00, 0xff, 0xff, 0x03, 0x00]), len, body]);
}

function check() {
  const ok = (cond, msg) => {
    if (!cond) throw new Error(`FAIL: ${msg}`);
  };
  const s = { memory: new Map(), log: [], seq: 0 };
  const m = s.memory;
  setRegisters(s, { D11: 3, D61: -2, D260: 70000 });
  ok(m.get('D260').value === 4464, 'values wrap to int16');

  for (const model of ['Q', 'iQ-R']) {
    const { res, info } = handle(m, request(0x0401, model, 11, 1));
    ok(hex(res) === 'D0 00 00 FF FF 03 00 04 00 00 00 03 00', `${model} read D11: ${hex(res)}`);
    ok(info.op === 'read' && info.device === 'D11', `${model} read info`);
  }
  // node-mc_protocol reads the data from byte 11 as Int16LE.
  ok(handle(m, request(0x0401, 'Q', 61, 1)).res.readInt16LE(11) === -2, 'negative value survives');

  const multi = handle(m, request(0x0401, 'Q', 10, 3)).res;
  ok(multi.readUInt16LE(7) === 8 && multi.readInt16LE(13) === 3, 'batch read of 3 words');

  const w = handle(m, request(0x1401, 'iQ-R', 100, 2, [7, 9]));
  ok(w.res.readUInt16LE(9) === 0 && m.get('D101').value === 9, 'batch write lands in memory');

  const bad = request(0x0401, 'Q', 0, 1);
  bad.writeUInt8(0x90, 18); // M, a bit device
  const err = handle(m, bad).res;
  ok(err.readUInt16LE(9) === END.BAD_DEVICE && err.readUInt16LE(7) === 11, 'unsupported device is refused');
  ok(handle(m, request(0x0401, 'Q', 0, 961)).res.readUInt16LE(9) === END.BAD_COUNT, 'count over 960 refused');

  // A sweep past the cap still answers, it just stops remembering new cells.
  for (let i = 0; i < 5; i++) handle(m, request(0x0401, 'Q', 1000 + i * 960, 960));
  ok(m.size === CELLS_MAX && handle(m, request(0x0401, 'Q', 9000, 1)).res.readUInt16LE(9) === 0, 'memory is capped');

  const other = new Map();
  handle(other, request(0x1401, 'Q', 11, 1, [99]));
  ok(m.get('D11').value === 3, 'sessions do not share memory');

  ok(parseKey('w1a') === 'W1A' && parseKey(' d 11 ') === 'D11' && parseKey('M5') === null, 'parseKey');
  console.log('mc-plc check passed');
}

if (process.argv.includes('--check')) {
  check();
} else {
  httpServer.listen(HTTP_PORT, () => {
    console.log(`PLC bridge ready. Open the PLC workspace in your browser — it connects by itself.`);
    console.log(`MC 3E   one PLC per browser tab, ports ${PORT_MIN}-${PORT_MAX}${PUBLIC_HOST ? ` on ${PUBLIC_HOST}` : ''} (the first is usually ${PORT_MIN})`);
    console.log(`HTTP    http://localhost:${HTTP_PORT}  (the workspace talks to this; leave this window open)`);
  });
}
