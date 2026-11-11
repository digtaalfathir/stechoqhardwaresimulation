import { Simulator } from '../core/simulator';
import type { ActionDef, ActionState, ConfigField, SimulatorMeta, StateRow, Tone } from '../core/types';
import { getJson } from '../core/wire';

/** One word register as the bridge holds it. Values are signed 16-bit. */
export interface Register {
  value: number;
  reads: number;
  writes: number;
  lastRead: string | null;
  lastWrite: string | null;
}

export type PlcMode = 'online' | 'silent' | 'offline';

/** One line of the bridge's request log (public/mc-plc.mjs `record`). */
interface LogEntry {
  seq: number;
  at: string;
  op: 'read' | 'write' | 'error' | 'connect' | 'disconnect' | 'ignored' | 'set' | 'mode';
  client?: string;
  device?: string | null;
  count?: number;
  values?: number[];
  end?: number;
  req?: string;
  res?: string;
  note?: string;
}

interface BridgeState {
  session: string;
  mode: PlcMode;
  mcPort: number;
  /** Set when the server knows its public name; otherwise the bridge URL's host is it. */
  mcHost: string | null;
  clients: string[];
  registers: Record<string, Register>;
  log: LogEntry[];
  seq: number;
}

interface PlcState {
  bridge: 'unknown' | 'up' | 'down';
  bridgeError: string;
  mode: PlcMode;
  /** 0 until the bridge has given this browser its own PLC. */
  mcPort: number;
  mcHost: string;
  clients: string[];
  registers: Record<string, Register>;
  seq: number;
  reads: number;
  writes: number;
  /** Requests the PLC refused (bad device, count, command). */
  errors: number;
  zeroing: boolean;
}

const POLL_MS = 500;

/** Baked in at build time (VITE_PLC_BRIDGE_URL) so the deployed site points at the hosted bridge. */
const DEFAULT_BRIDGE =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_PLC_BRIDGE_URL ||
  'http://localhost:8201';

interface Session {
  id: string;
  port: number;
}

/**
 * The session survives a page reload, so the port your program dials does too.
 * Storage can be missing or throw (private window, tests); then a reload simply
 * opens a new session.
 */
const storeKey = (base: string) => `shs.plc.session:${base}`;
function loadSession(base: string): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(storeKey(base)) ?? 'null') as Session | null;
    return s && typeof s.id === 'string' && typeof s.port === 'number' ? s : null;
  } catch {
    return null;
  }
}
function saveSession(base: string, s: Session | null) {
  try {
    if (s) localStorage.setItem(storeKey(base), JSON.stringify(s));
    else localStorage.removeItem(storeKey(base));
  } catch {
    /* not persisted — fine */
  }
}

/** Devices the bridge serves (public/mc-plc.mjs). X, Y, B and W count in hex, like on the PLC. */
const HEX_DEVICES = new Set(['W', 'B', 'X', 'Y']);
const BIT_DEVICES = new Set(['M', 'L', 'B', 'X', 'Y', 'SM']);

export const deviceKey = (dev: string, no: number) => dev + (HEX_DEVICES.has(dev) ? no.toString(16).toUpperCase() : String(no));

/** "M16000" -> { dev: 'M', no: 16000 }; "X1F" -> { dev: 'X', no: 31 }. */
export function splitKey(key: string): { dev: string; no: number } {
  const dev = /^[A-Z]+/.exec(key)?.[0] ?? '';
  return { dev, no: parseInt(key.slice(dev.length), HEX_DEVICES.has(dev) ? 16 : 10) };
}

/** One bit per address (M, L, B, X, Y, SM) rather than a 16-bit word. */
export const isBitKey = (key: string) => BIT_DEVICES.has(splitKey(key).dev);

/** "D11", "w1a", "m16000", "x1f" -> "D11" / "W1A" / "M16000" / "X1F", or null. */
export function parseRegister(text: string): string | null {
  const m = /^\s*(SM|SD|ZR|[DRWMLBXY])\s*([0-9A-F]+)\s*$/i.exec(text);
  if (!m) return null;
  const dev = m[1].toUpperCase();
  const hexNo = HEX_DEVICES.has(dev);
  if (!hexNo && !/^[0-9]+$/.test(m[2])) return null;
  return deviceKey(dev, parseInt(m[2], hexNo ? 16 : 10));
}

const toInt16 = (v: number) => ((((Math.trunc(v) + 32768) % 65536) + 65536) % 65536) - 32768;

/**
 * Mitsubishi PLC answering MC Protocol (3E binary frame).
 *
 * A browser cannot accept a TCP connection, so the socket half lives in
 * public/mc-plc.mjs, which the website serves and the visitor runs with one
 * command. The bridge gives each browser tab its own PLC on its own TCP port; your acquisition program
 * dials that port, and this workspace edits and watches the same register
 * memory over HTTP. Every request the client makes comes back here as an event
 * with its real bytes.
 */
export class McPlcSimulator extends Simulator<PlcState> {
  readonly meta: SimulatorMeta = {
    id: 'plc',
    name: 'PLC (MC Protocol)',
    category: 'Factory Devices',
    icon: 'cpu',
    tagline: 'Mitsubishi PLC device memory served over MC Protocol 3E — edit D registers and M bits live.',
    description:
      'Simulates a Mitsubishi Q / iQ-R PLC for data-acquisition programs. Run the one-line command the workspace shows (it only needs Node) and you get a PLC on localhost: point your program at the address shown and it answers MC Protocol 3E binary batch reads and writes — word devices (D, R, W, SD, ZR) and bit devices (M, L, B, X, Y, SM), in word or bit units — exactly as the CPU would. This workspace edits that register memory live and shows every request your program makes, byte for byte. Registers appear by themselves as soon as a client reads them. The PLC can also be taken offline (connection refused) or made silent (connected but never answering) to test reconnect and timeout handling.',
    protocols: ['MC Protocol 3E'],
  };

  readonly configFields: ConfigField[] = [
    {
      key: 'bridgeUrl',
      label: 'Bridge URL',
      type: 'text',
      default: DEFAULT_BRIDGE,
      mono: true,
      hint: 'The bridge you started with the command below — localhost unless you host one',
    },
    {
      key: 'zeroSeconds',
      label: 'Zero Duration',
      type: 'number',
      default: 10,
      min: 1,
      max: 600,
      step: 1,
      hint: 'Seconds Zero & Restore holds 0 — longer than your poll interval',
    },
  ];

  readonly actions: ActionDef[] = [
    {
      id: 'zero-restore',
      label: 'Zero & Restore',
      activeLabel: 'Holding 0…',
      tone: 'primary',
      hint: 'Every register 0 for the zero duration, then back — like a jig change',
    },
    { id: 'mode-online', label: 'Online', hint: 'Answer every request' },
    { id: 'mode-silent', label: 'Silent', hint: 'Accept connections, never answer — client times out' },
    { id: 'mode-offline', label: 'Offline', hint: 'Stop listening — connection refused' },
    { id: 'reset', label: 'Reset View', tone: 'danger', hint: 'Clear this view; your PLC keeps its memory' },
  ];

  private poller: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  /** Bumped on every local edit, so a poll that started earlier cannot undo it. */
  private editSeq = 0;
  private session: Session | null = null;
  /** The first poll of a session adopts it instead of replaying its backlog. */
  private fresh = true;
  /** The session was lost while this view held registers: put them back in the next one. */
  private restore = false;
  /** Port of the lost session, asked for again so the program needs no reconfiguring. */
  private wishPort = 0;
  private lastTry = 0;

  protected initialState(): PlcState {
    return {
      bridge: 'unknown',
      bridgeError: '',
      mode: 'online',
      mcPort: 0,
      mcHost: '',
      clients: [],
      registers: {},
      seq: 0,
      reads: 0,
      writes: 0,
      errors: 0,
      zeroing: false,
    };
  }

  private base(): string {
    return this.cfg('bridgeUrl').replace(/\/+$/, '');
  }

  private host(): string {
    try {
      return new URL(this.base()).hostname;
    } catch {
      return 'localhost';
    }
  }

  /** Where your acquisition program connects. */
  endpoint(): string {
    return this.state.mcPort ? `${this.state.mcHost || this.host()}:${this.state.mcPort}` : '';
  }

  protected onConfigApplied() {
    // A different URL is a different bridge: resume or open a session there.
    this.session = null;
    this.restore = false;
    this.wishPort = 0;
    this.state = { ...this.state, bridge: 'unknown' };
    this.startPolling();
  }

  reset() {
    super.reset();
    this.fresh = true;
    this.startPolling();
  }

  private startPolling() {
    this.stop(this.poller);
    this.poller = this.every(POLL_MS, () => void this.poll());
    void this.poll();
  }

  private async poll() {
    if (this.polling) return;
    // While nothing is listening, knock every 2 s instead of every 500 ms: each
    // refused request is a red line in the browser console.
    if (this.state.bridge === 'down' && Date.now() - this.lastTry < 2000) return;
    this.lastTry = Date.now();
    this.polling = true;
    try {
      await this.pollOnce();
    } finally {
      this.polling = false;
    }
  }

  private async pollOnce() {
    const base = this.base();
    if (!this.session) {
      const saved = loadSession(base);
      this.session = saved ?? (await this.openSession(base));
      if (!this.session) return;
      this.fresh = true;
      if (saved) this.wishPort = saved.port;
    }

    const edit = this.editSeq;
    const res = await getJson<BridgeState>(`${base}/sessions/${this.session.id}/state?since=${this.state.seq}`, 3000);

    if (res.status === 404) {
      // Expired (idle too long) or the bridge restarted. Open a new one next tick.
      this.wishPort = this.session.port;
      this.session = null;
      saveSession(base, null);
      this.restore = Object.keys(this.state.registers).length > 0;
      this.setState({ seq: 0, clients: [] });
      return;
    }
    if (!res.ok || !res.data) return this.down(res.error ?? 'no answer');

    const d = res.data;
    const wasUp = this.state.bridge === 'up';
    if (!this.fresh) for (const e of d.log) this.report(e);
    const adopt = edit === this.editSeq && !this.restore;
    this.fresh = false;

    this.status = d.clients.length ? 'SIMULATING' : 'CONNECTED';
    this.setState({
      bridge: 'up',
      bridgeError: '',
      mode: d.mode,
      mcPort: d.mcPort,
      mcHost: d.mcHost ?? '',
      clients: d.clients,
      seq: d.seq,
      ...(adopt ? { registers: d.registers } : {}),
    });

    if (!wasUp) {
      this.emit('BRIDGE_CONNECTED', { url: base, endpoint: this.endpoint(), registers: Object.keys(d.registers).length }, {
        tone: 'ok',
        summary: `Your PLC is at ${this.endpoint()} — point your program there`,
      });
    }
    if (this.restore) {
      this.restore = false;
      const values = Object.fromEntries(Object.entries(this.state.registers).map(([k, r]) => [k, r.value]));
      void this.push(values, 'New session — registers restored');
    }
  }

  /** Asks the bridge for a PLC of our own, on the old port when it is still free. */
  private async openSession(base: string): Promise<Session | null> {
    try {
      const res = await fetch(`${base}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: this.wishPort || undefined }),
        signal: AbortSignal.timeout(5000),
      });
      const body = (await res.json()) as { session?: string; mcPort?: number; error?: string };
      if (!res.ok || !body.session || !body.mcPort) {
        this.down(body.error ?? `${res.status} ${res.statusText}`);
        return null;
      }
      const session = { id: body.session, port: body.mcPort };
      saveSession(base, session);
      const moved = this.wishPort && this.wishPort !== session.port;
      this.emit('SESSION_OPENED', { url: base, port: session.port }, {
        tone: moved ? 'warn' : 'ok',
        summary: moved
          ? `Port ${this.wishPort} was taken — your PLC moved to port ${session.port}, update your program`
          : `PLC session opened on port ${session.port}`,
      });
      return session;
    } catch (err) {
      this.down(err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  private down(error: string) {
    if (this.state.bridge === 'down') return;
    this.status = 'ERROR';
    this.setState({ bridge: 'down', bridgeError: error, clients: [] });
    this.emit('BRIDGE_UNREACHABLE', { url: this.base(), error }, {
      tone: 'error',
      summary: `Bridge not reachable at ${this.base()}`,
    });
  }

  /** Turns one bridge log line into an event, with its real bytes as the frame. */
  private report(e: LogEntry) {
    const client = e.client ?? '';
    const values = (e.values ?? []).join(', ');
    const end = `0x${(e.end ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;
    const frame = (summary: string) => ({
      protocol: 'MC 3E',
      direction: 'inbound' as const,
      summary,
      detail: [`client    ${client}`, `request   ${e.req ?? ''}`, `response  ${e.res ?? '(none)'}`, '', `end code  ${end}`].join('\n'),
      live: true,
    });
    const payload = { client, device: e.device, count: e.count, values: e.values, end_code: end, at: e.at };
    const emit = (name: string, tone: Tone, summary: string, wire?: string) =>
      this.emit(name, payload, { tone, summary, transport: wire ? frame(wire) : undefined });

    switch (e.op) {
      case 'read':
        this.state.reads++;
        return emit('MC_READ', 'ok', `${client} read ${e.device} ×${e.count} → ${values}`, `0401 read ${e.device} ×${e.count} → ${values}`);
      case 'write':
        this.state.writes++;
        return emit('MC_WRITE', 'active', `${client} wrote ${e.device} ← ${values}`, `1401 write ${e.device} ← ${values}`);
      case 'error':
        this.state.errors++;
        return emit('MC_ERROR', 'error', `${client} ${e.device ?? ''} refused, end code ${end}${e.note ? ` — ${e.note}` : ''}`, e.req ? `refused ${e.device ?? ''} → ${end}` : undefined);
      case 'ignored':
        return emit('MC_IGNORED', 'warn', `${client} request left unanswered (silent mode)`, 'no answer (silent)');
      case 'connect':
        return this.emit('CLIENT_CONNECTED', { client }, { tone: 'ok', summary: `${client} connected` });
      case 'disconnect':
        return this.emit('CLIENT_DISCONNECTED', { client }, { tone: 'neutral', summary: `${client} disconnected` });
    }
  }

  private sessionUrl(path: string): string {
    return `${this.base()}/sessions/${this.session?.id ?? 'none'}/${path}`;
  }

  private push(patch: Record<string, number | null>, label: string) {
    // No session yet: the edit stays in this view and goes over once one opens.
    if (!this.session) {
      this.restore = true;
      return;
    }
    return this.dispatch(patch, {
      label,
      url: this.sessionUrl('registers'),
      events: { ok: 'REGISTER_SET', fail: 'REGISTER_SET_FAILED' },
      coalesce: false,
    });
  }

  // --- called by the register panel ----------------------------------------

  /** Sets one register now; the bridge serves it on the next client read. */
  setRegister(key: string, value: number) {
    const v = isBitKey(key) ? (value ? 1 : 0) : toInt16(value);
    const cur = this.state.registers[key] ?? { reads: 0, writes: 0, lastRead: null, lastWrite: null };
    this.editSeq++;
    this.setState({ registers: { ...this.state.registers, [key]: { ...cur, value: v } } });
    void this.push({ [key]: v }, `${key} = ${v}`);
  }

  /** Returns an error message, or null when the register was added. */
  addRegister(text: string, value: number): string | null {
    const key = parseRegister(text);
    if (!key) return 'Use a device and its number — e.g. D11, R100, W1A, M16000, X1F';
    if (!Number.isFinite(value)) return 'Value must be a number';
    this.setRegister(key, value);
    return null;
  }

  /**
   * The Stop button. Every tab's PLC goes with the bridge; their registers stay
   * in each view and are put back when it is started again.
   */
  stopBridge() {
    void this.dispatch({}, {
      label: 'Stop PLC bridge',
      url: `${this.base()}/shutdown`,
      events: { ok: 'BRIDGE_STOPPED', fail: 'BRIDGE_STOP_FAILED' },
      coalesce: false,
    });
  }

  removeRegister(key: string) {
    this.editSeq++;
    const { [key]: _gone, ...rest } = this.state.registers;
    this.setState({ registers: rest });
    void this.push({ [key]: null }, `${key} removed`);
  }

  /** Device name first, then the number the way the PLC counts it. */
  registerKeys(): string[] {
    return Object.keys(this.state.registers).sort((a, b) => {
      const x = splitKey(a);
      const y = splitKey(b);
      return x.dev.localeCompare(y.dev) || x.no - y.no;
    });
  }

  // --- actions --------------------------------------------------------------

  protected onAction(id: string) {
    if (id.startsWith('mode-')) {
      const mode = id.slice(5) as PlcMode;
      void this.dispatch({ mode }, {
        label: `Mode → ${mode}`,
        url: this.sessionUrl('mode'),
        events: { ok: 'MODE_CHANGED', fail: 'MODE_CHANGE_FAILED' },
        coalesce: false,
      });
      return;
    }
    if (id === 'zero-restore') this.zeroAndRestore();
  }

  private zeroAndRestore() {
    if (this.state.zeroing) return;
    const keys = Object.keys(this.state.registers);
    if (!keys.length) return;
    const snapshot = Object.fromEntries(keys.map((k) => [k, this.state.registers[k].value]));
    this.editSeq++;
    this.setState({ zeroing: true });
    void this.push(Object.fromEntries(keys.map((k) => [k, 0])), `${keys.length} register(s) → 0`);
    this.after(this.num('zeroSeconds') * 1000, () => {
      this.editSeq++;
      this.setState({ zeroing: false });
      void this.push(snapshot, `${keys.length} register(s) restored`);
    });
  }

  actionState(id: string): ActionState {
    const down = this.state.bridge !== 'up';
    if (id === 'zero-restore') {
      return { active: this.state.zeroing, disabled: down || this.state.zeroing || !Object.keys(this.state.registers).length };
    }
    if (id.startsWith('mode-')) return { active: this.state.mode === id.slice(5), disabled: down };
    return {};
  }

  // --- views ----------------------------------------------------------------

  stateRows(): StateRow[] {
    const s = this.state;
    const modeTone: Tone = s.mode === 'online' ? 'ok' : 'warn';
    return [
      {
        label: 'Bridge',
        value: s.bridge === 'up' ? 'UP' : s.bridge === 'down' ? 'NOT REACHABLE' : 'CHECKING…',
        tone: s.bridge === 'up' ? 'ok' : s.bridge === 'down' ? 'error' : 'neutral',
      },
      { label: 'MC Endpoint', value: s.mcPort ? `${this.endpoint()} · 3E binary` : '—', mono: true },
      { label: 'PLC Mode', value: s.mode.toUpperCase(), tone: modeTone },
      { label: 'Clients', value: s.clients.length ? s.clients.join(', ') : 'none', mono: true, tone: s.clients.length ? 'active' : 'neutral' },
      { label: 'Registers', value: String(Object.keys(s.registers).length), mono: true },
      { label: 'Reads / Writes', value: `${s.reads} / ${s.writes}`, mono: true },
    ];
  }

  samplePayload() {
    return {
      client: '127.0.0.1:53122',
      device: 'D11',
      count: 1,
      values: [3],
      end_code: '0x0000',
      at: '2026-11-11T08:47:48.070Z',
    };
  }
}
