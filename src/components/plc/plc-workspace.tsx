import { useEffect, useState } from 'react';
import { deviceKey, isBitKey, splitKey, type McPlcSimulator, type PlcMode } from '../../simulators/plc/mc-plc';
import type { SimEvent } from '../../simulators/core/types';
import { useSimulator } from '../../lib/use-simulator';
import { useT } from '../../lib/i18n';
import { useComments } from '../../lib/use-comments';
import { CopyButton } from '../copy-button';
import { EventStream } from '../event-stream';
import { CommunicationLog, ConfigPanel } from '../workspace';
import { MC_EVENTS, PlcCabinet, activeClients, useNow } from './plc-rack';
import './plc.css';

/**
 * The PLC workspace: a status line, the cabinet with the rack in it, and
 * under it the engineer's tools — a device monitor in the GX Works manner and
 * a decoder for the frames on the wire.
 */
export function PlcWorkspace({ sim }: { sim: McPlcSimulator }) {
  useSimulator(sim);
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);

  // The bridge is looked for as soon as the workspace opens.
  useEffect(() => {
    if (sim.status === 'OFFLINE') sim.applyConfig({});
  }, [sim]);

  const selected = sim.events.find((e) => e.seq === selectedSeq) ?? null;
  const frame = selected && MC_EVENTS.has(selected.name) ? selected : sim.events.find((e) => MC_EVENTS.has(e.name)) ?? null;

  return (
    <>
      <StatusBar sim={sim} />
      <PlcCabinet sim={sim} />
      <div className="pl-lower">
        <DeviceMonitor sim={sim} />
        <div className="pl-side">
          <FrameDecoder ev={frame} pinned={!!selected && frame === selected} />
          <EventStream
            events={sim.events}
            selectedSeq={selectedSeq}
            onSelect={setSelectedSeq}
            onClear={() => {
              sim.clearEvents();
              setSelectedSeq(null);
            }}
          />
        </div>
      </div>
      <div className="ws-row">
        <CommunicationLog events={sim.events} />
      </div>
    </>
  );
}

const MODES: [PlcMode, string, string][] = [
  ['online', 'Online', '#2bd47a'],
  ['silent', 'Silent', '#ffb020'],
  ['offline', 'Offline', '#ff4b3e'],
];

function StatusBar({ sim }: { sim: McPlcSimulator }) {
  const t = useT();
  const st = sim.state;
  const [settings, setSettings] = useState(false);
  const up = st.bridge === 'up';
  const clients = activeClients(sim).list;
  return (
    <>
      <section className="panel pl-status">
        <span className={`pl-dot ${st.bridge}`} title={st.bridge} />
        {up ? (
          <>
            <span className="muted">{t('plc.endpoint.short', 'Endpoint')}</span>
            <span className="pl-endpoint">{sim.endpoint()}</span>
            <CopyButton text={sim.endpoint()} />
            <span className="pl-kv">
              <span className="muted">CPU</span> <b>Q03UDV · 3E binary</b>
            </span>
            <span className="pl-kv">
              <span className="muted">Client</span> <b>{clients.length ? clients.join(', ') : '—'}</b>
            </span>
          </>
        ) : (
          <span className="muted">
            {st.bridge === 'down'
              ? t('plc.down', 'The PLC is not running on this computer yet.')
              : t('plc.checking', 'Looking for the PLC…')}
          </span>
        )}
        <span className="spacer" />
        <div className="pl-modes" role="group" aria-label={t('plc.mode', 'PLC condition')}>
          {MODES.map(([id, label, color]) => (
            <button
              key={id}
              type="button"
              aria-pressed={st.mode === id}
              disabled={!up}
              title={sim.actions.find((a) => a.id === `mode-${id}`)?.hint}
              onClick={() => sim.run(`mode-${id}`)}
            >
              <i style={{ background: color }} />
              {label}
            </button>
          ))}
        </div>
        {up && (
          <button type="button" className="btn btn-sm btn-danger" onClick={() => sim.stopBridge()}>
            ■ {t('plc.stop', 'Stop PLC')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm"
          aria-expanded={settings}
          onClick={() => setSettings((v) => !v)}
          title={t('plc.settings', 'Settings')}
        >
          ⚙
        </button>
      </section>
      {settings && <ConfigPanel key={`${sim.meta.id}:${sim.num('zeroSeconds')}`} sim={sim} />}
    </>
  );
}

// --- device monitor ------------------------------------------------------------

/**
 * The value box keeps what you are typing while the client keeps reading:
 * it shows the live value until focused, then a draft until Enter or blur
 * commits it (Esc puts the live value back).
 */
function ValueInput({
  shown,
  label,
  onCommit,
  disabled,
}: {
  shown: string;
  label: string;
  onCommit: (text: string) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      value={draft ?? shown}
      aria-label={label}
      inputMode="numeric"
      spellCheck={false}
      disabled={disabled}
      onFocus={(e) => {
        setDraft(shown);
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null) onCommit(draft);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          const el = e.currentTarget;
          setDraft(null);
          requestAnimationFrame(() => el.blur());
        }
      }}
    />
  );
}

const hex = (v: number) => (v & 0xffff).toString(16).toUpperCase().padStart(4, '0');

function DeviceMonitor({ sim }: { sim: McPlcSimulator }) {
  const t = useT();
  const st = sim.state;
  const all = sim.registerKeys();
  const keys = all.filter((k) => !isBitKey(k));
  const bitKeys = all.filter(isBitKey);
  const [comments, setComment] = useComments('shs.plc.comments');
  const [addr, setAddr] = useState('');
  const [val, setVal] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [radix, setRadix] = useState<'dec' | 'hex'>('dec');
  // Rows light up for a moment after the client touched them.
  const recentAny = all.some((k) => {
    const r = st.registers[k];
    return [r.lastRead, r.lastWrite].some((at) => at && Date.now() - Date.parse(at) < 1500);
  });
  const now = useNow(recentAny, 250);
  const zero = sim.actionState('zero-restore');

  const add = () => {
    const n = radix === 'hex' ? parseInt(val, 16) : Number(val);
    const err = sim.addRegister(addr, n);
    setError(err);
    if (!err) setAddr('');
  };
  const parse = (text: string) => (radix === 'hex' ? parseInt(text.trim(), 16) : Number(text.trim()));

  return (
    <section className="panel pl-monitor">
      <div className="panel-head">
        <span className="panel-title">{t('plc.monitor', 'Device Monitor')}</span>
        <span className="chip">
          {all.length} device
        </span>
        <span className="spacer" />
        <span className="chip t-ok">{t('plc.live', 'served on the next read')}</span>
      </div>
      <div className="pl-toolbar">
        <input
          className="mono-input"
          placeholder="D260"
          aria-label={t('plc.addr', 'Register')}
          value={addr}
          spellCheck={false}
          onChange={(e) => setAddr(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <input
          className="mono-input"
          aria-label={t('plc.value', 'Value')}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button type="button" className="btn btn-sm" onClick={add} disabled={!addr.trim() || st.bridge !== 'up'}>
          + {t('plc.add', 'Add / Set')}
        </button>
        {error && <span className="t-error pl-err">{error}</span>}
        <span className="spacer" />
        <div className="pl-radix" role="group" aria-label="DEC / HEX">
          {(['dec', 'hex'] as const).map((r) => (
            <button key={r} type="button" aria-pressed={radix === r} onClick={() => setRadix(r)}>
              {r.toUpperCase()}
            </button>
          ))}
        </div>
        <select
          className="pl-select"
          aria-label={t('plc.zero.hold', 'Hold 0 for')}
          value={sim.num('zeroSeconds')}
          onChange={(e) => sim.applyConfig({ zeroSeconds: Number(e.target.value) })}
          disabled={zero.active}
        >
          {[3, 5, 10, 20, 30].map((s) => (
            <option key={s} value={s}>
              {s} s
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`btn btn-sm ${zero.active ? 'btn-running' : 'btn-primary'}`}
          disabled={zero.disabled}
          onClick={() => sim.run('zero-restore')}
          title={sim.actions.find((a) => a.id === 'zero-restore')?.hint}
        >
          ⟲ {zero.active ? t('plc.zero.holding', 'Holding 0…') : t('plc.zero', 'Zero & Restore')}
        </button>
      </div>

      {all.length === 0 ? (
        <p className="empty">
          {t('plc.empty', 'No registers yet. Add one above, or just start your program — every register it reads appears here.')}
        </p>
      ) : keys.length === 0 ? null : (
        <div className="scroll-x">
          {/* Fixed columns: the client reading every second must never move the value box. */}
          <table className="pl-table">
            <colgroup>
              <col style={{ width: 96 }} />
              <col />
              <col style={{ width: 176 }} />
              <col style={{ width: 66 }} />
              <col style={{ width: 170 }} />
              <col style={{ width: 170 }} />
              <col style={{ width: 36 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Device</th>
                <th>{t('plc.comment', 'Comment')}</th>
                <th>
                  {t('plc.value', 'Value')} ({radix.toUpperCase()})
                </th>
                <th>{radix === 'dec' ? 'HEX' : 'DEC'}</th>
                <th>{t('plc.reads', 'Read by client')}</th>
                <th>{t('plc.writes', 'Written by client')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const r = st.registers[k];
                const read = !!r.lastRead && now - Date.parse(r.lastRead) < 1500;
                const wrote = !!r.lastWrite && now - Date.parse(r.lastWrite) < 1500;
                const shown = radix === 'dec' ? String(r.value) : hex(r.value);
                const commit = (text: string) => {
                  const n = parse(text);
                  if (text.trim() !== '' && Number.isFinite(n) && n !== r.value) sim.setRegister(k, n);
                };
                const stamp = (n: number, at: string | null) =>
                  n ? `${n}× · ${new Date(at!).toLocaleTimeString([], { hour12: false })}` : '—';
                return (
                  <tr key={k} className={wrote ? 'write' : read ? 'read' : ''}>
                    <td className="pl-dev">
                      <i className="pl-led" aria-hidden="true" />
                      {k}
                    </td>
                    <td>
                      <input
                        className="pl-comment"
                        value={comments[k] ?? ''}
                        placeholder={t('plc.comment.hint', 'add a comment')}
                        aria-label={`${k} comment`}
                        onChange={(e) => setComment(k, e.target.value)}
                      />
                    </td>
                    <td>
                      <span className="pl-valbox">
                        <ValueInput shown={shown} label={`${k} value`} onCommit={commit} disabled={st.bridge !== 'up'} />
                        <button type="button" aria-label={`${k} − 1`} onClick={() => sim.setRegister(k, r.value - 1)} disabled={st.bridge !== 'up'}>
                          −
                        </button>
                        <button type="button" aria-label={`${k} + 1`} onClick={() => sim.setRegister(k, r.value + 1)} disabled={st.bridge !== 'up'}>
                          +
                        </button>
                      </span>
                    </td>
                    <td className="pl-dim">{radix === 'dec' ? hex(r.value) : r.value}</td>
                    <td className="pl-dim">
                      <span className="pl-stamp">{stamp(r.reads, r.lastRead)}</span>
                      <span className={`pl-flag r${read ? ' on' : ''}`}>READ</span>
                    </td>
                    <td className="pl-dim">
                      <span className="pl-stamp">{stamp(r.writes, r.lastWrite)}</span>
                      <span className={`pl-flag w${wrote ? ' on' : ''}`}>WRITE</span>
                    </td>
                    <td>
                      <button type="button" className="pl-x" aria-label={`Remove ${k}`} onClick={() => sim.removeRegister(k)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {bitKeys.length > 0 && <BitBlocks sim={sim} keys={bitKeys} now={now} />}
      <p className="panel-note">
        {t(
          'plc.note2',
          'Words are signed 16-bit, as node-mc_protocol reads them; bits (M, L, B, X, Y, SM) are one per address and read as words 16 at a time, the lowest address in bit 0. D, R, M and L count in decimal; W, B, X and Y in hex. Values are committed on Enter or when the field loses focus, so a client polling mid-typing never reads a half-typed value. Comments stay in this browser.',
        )}
      </p>
    </section>
  );
}

/**
 * Bit devices, 16 to a row the way a word read sees them: click a bit to flip
 * it. Bits the client has not touched yet are drawn faint and can still be set.
 */
function BitBlocks({ sim, keys, now }: { sim: McPlcSimulator; keys: string[]; now: number }) {
  const t = useT();
  const st = sim.state;
  const up = st.bridge === 'up';
  const blocks = new Map<string, { dev: string; base: number }>();
  for (const k of keys) {
    const { dev, no } = splitKey(k);
    const base = no - (no % 16);
    blocks.set(deviceKey(dev, base), { dev, base });
  }
  const recent = (at: string | null) => !!at && now - Date.parse(at) < 1500;
  return (
    <div className="pl-bits">
      <div className="pl-bits-head">
        <span>{t('plc.bits', 'Bit devices')}</span>
        <span className="muted">{t('plc.bits.hint', 'click a bit to flip it · word = how getWords reads the row')}</span>
      </div>
      <div className="scroll-x">
        <div className="pl-bits-grid">
          {[...blocks.entries()].map(([id, { dev, base }]) => {
            const cells = Array.from({ length: 16 }, (_, j) => {
              const key = deviceKey(dev, base + j);
              return { key, j, r: st.registers[key] };
            });
            const word = cells.reduce((v, c) => v | ((c.r?.value ?? 0) & 1) << c.j, 0);
            const present = cells.filter((c) => c.r).map((c) => c.r!);
            const reads = Math.max(0, ...present.map((r) => r.reads));
            const lastRead = present.map((r) => r.lastRead).filter(Boolean).sort().pop() ?? null;
            const lastWrite = present.map((r) => r.lastWrite).filter(Boolean).sort().pop() ?? null;
            const cls = recent(lastWrite) ? 'write' : recent(lastRead) ? 'read' : '';
            return (
              <div key={id} className={`pl-bitrow ${cls}`}>
                <span className="pl-dev">
                  <i className="pl-led" aria-hidden="true" />
                  {id}
                  <small>–{deviceKey(dev, base + 15).slice(dev.length)}</small>
                </span>
                <span className="pl-bitcells" role="group" aria-label={`${id} bits`}>
                  {cells.map(({ key, j, r }) => (
                    <button
                      key={key}
                      type="button"
                      className={`${r ? (r.value ? 'on' : '') : 'absent'}`}
                      aria-pressed={!!r?.value}
                      title={`${key} = ${r?.value ?? 0}`}
                      disabled={!up}
                      onClick={() => sim.setRegister(key, r?.value ? 0 : 1)}
                    >
                      {j.toString(16).toUpperCase()}
                    </button>
                  ))}
                </span>
                <span className="pl-dim pl-word" title={`${id} as a word`}>
                  {hex(word)}
                </span>
                <span className="pl-dim">
                  <span className="pl-stamp">
                    {reads ? `${reads}× · ${new Date(lastRead!).toLocaleTimeString([], { hour12: false })}` : '—'}
                  </span>
                  <span className={`pl-flag ${cls === 'write' ? 'w' : 'r'}${cls ? ' on' : ''}`}>{cls === 'write' ? 'WRITE' : 'READ'}</span>
                </span>
                <button
                  type="button"
                  className="pl-x"
                  aria-label={`Remove ${id}`}
                  onClick={() => cells.forEach((c) => c.r && sim.removeRegister(c.key))}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- frame decoder -----------------------------------------------------------------

type Seg = { bytes: string[]; kind: number; label: string; meaning: string };

/** Device codes the bridge serves, as they appear in a 3E frame. */
const DEVICE_CODES: Record<string, string> = {
  A8: 'D', AF: 'R', B4: 'W', A9: 'SD', B0: 'ZR',
  '90': 'M', '92': 'L', A0: 'B', '9C': 'X', '9D': 'Y', '91': 'SM',
};

const END_CODES: Record<string, string> = {
  '0000': 'OK',
  C051: 'too many points',
  C056: 'device not supported / out of range',
  C059: 'command not supported',
};

function bytesOf(line: string | undefined): string[] {
  return (line ?? '').trim().split(/\s+/).filter((b) => /^[0-9A-F]{2}$/i.test(b));
}
const word = (b: string[]) => b.slice().reverse().join('');

/** Cuts a 3E binary request into its fields, Q or iQ-R layout by the sub-command. */
function splitRequest(b: string[]): Seg[] {
  if (b.length < 15) return [{ bytes: b, kind: 6, label: 'Bytes', meaning: '' }];
  const sub = word(b.slice(13, 15));
  const iqr = sub === '0002' || sub === '0003';
  const bitUnits = sub === '0001' || sub === '0003';
  const cmd = word(b.slice(11, 13));
  const at = iqr ? [15, 19, 21, 23] : [15, 18, 19, 21];
  const no = parseInt(word(b.slice(at[0], at[1])), 16);
  const code = word(b.slice(at[1], at[2]));
  const dev = DEVICE_CODES[code.slice(-2)];
  const n = parseInt(word(b.slice(at[2], at[3])), 16);
  const segs: Seg[] = [
    { bytes: b.slice(0, 2), kind: 1, label: 'Subheader', meaning: `${b[0]}${b[1]} · 3E request` },
    { bytes: b.slice(2, 7), kind: 2, label: 'Route', meaning: `net ${b[2]} · PC ${b[3]} · I/O ${word(b.slice(4, 6))} · st ${b[6]}` },
    { bytes: b.slice(7, 11), kind: 6, label: 'Length · timer', meaning: `${parseInt(word(b.slice(7, 9)), 16)} byte · ${parseInt(word(b.slice(9, 11)), 16) * 0.25} s` },
    { bytes: b.slice(11, 15), kind: 3, label: 'Command', meaning: `${cmd} ${cmd === '0401' ? 'batch read' : cmd === '1401' ? 'batch write' : ''} · sub ${sub} (${iqr ? 'iQ-R' : 'Q'}${bitUnits ? ', bit units' : ''})` },
    {
      bytes: b.slice(at[0], at[2]),
      kind: 4,
      label: 'Device',
      meaning: dev ? `${deviceKey(dev, no)} (code ${code.slice(-2)})` : `code ${code.slice(-2)} — not served`,
    },
    {
      bytes: b.slice(at[2], at[3]),
      kind: 5,
      label: 'Points',
      meaning: bitUnits ? `${n} bit` : dev && isBitKey(dev + '0') ? `${n} word = ${n * 16} bit` : `${n} word`,
    },
  ];
  if (b.length > at[3]) {
    const bytes = b.length - at[3];
    segs.push({ bytes: b.slice(at[3]), kind: 6, label: 'Data', meaning: bitUnits ? `${n} bit(s) to write, 2 per byte` : `${bytes / 2} word(s) to write` });
  }
  return segs;
}

function splitResponse(b: string[]): Seg[] {
  if (b.length < 11) return [{ bytes: b, kind: 6, label: 'Bytes', meaning: '' }];
  const end = word(b.slice(9, 11));
  const segs: Seg[] = [
    { bytes: b.slice(0, 2), kind: 1, label: 'Subheader', meaning: 'D000 · 3E response' },
    { bytes: b.slice(2, 7), kind: 2, label: 'Route', meaning: 'echoed' },
    { bytes: b.slice(7, 9), kind: 6, label: 'Length', meaning: `${parseInt(word(b.slice(7, 9)), 16)} byte` },
    { bytes: b.slice(9, 11), kind: end === '0000' ? 4 : 5, label: 'End code', meaning: `${end} ${END_CODES[end] ?? ''}` },
  ];
  if (b.length > 11) segs.push({ bytes: b.slice(11), kind: 5, label: 'Data', meaning: `${b.length - 11} byte` });
  return segs;
}

function FrameDecoder({ ev, pinned }: { ev: SimEvent | null; pinned: boolean }) {
  const t = useT();
  const detail = ev?.transport?.detail ?? '';
  const line = (name: string) => detail.split('\n').find((l) => l.startsWith(name))?.slice(name.length);
  const req = bytesOf(line('request'));
  const res = bytesOf(line('response'));
  const p = (ev?.payload ?? {}) as { client?: string; device?: string; values?: number[]; end_code?: string };
  const head =
    ev?.name === 'MC_READ' ? '0401 · batch read' : ev?.name === 'MC_WRITE' ? '1401 · batch write' : ev?.name === 'MC_ERROR' ? 'refused' : ev ? 'no answer' : '';

  const row = (segs: Seg[]) => (
    <>
      <div className="pl-bytes">
        {segs.map((s, i) => (
          <span key={i} className={`pl-k${s.kind}`}>
            {s.bytes.join(' ')}
          </span>
        ))}
      </div>
      <dl className="pl-fields">
        {segs.map((s, i) => (
          <div key={i}>
            <dt>
              <i className={`pl-k${s.kind}`} />
              {s.label}
            </dt>
            <dd>{s.meaning}</dd>
          </div>
        ))}
      </dl>
    </>
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{t('plc.decoder', 'Frame Decoder')}</span>
        <span className="spacer" />
        {pinned && <span className="chip">{t('plc.decoder.pinned', 'selected')}</span>}
        {head && <span className="chip t-active">{head}</span>}
      </div>
      {!ev ? (
        <p className="empty">{t('plc.decoder.empty', 'No frame yet. When your program reads or writes, its bytes are taken apart here.')}</p>
      ) : (
        <div className="pl-frame">
          <h5>
            Request <span className="mono">← {p.client}</span>
          </h5>
          {row(splitRequest(req))}
          <h5>Response</h5>
          {res.length ? row(splitResponse(res)) : <p className="muted">{t('plc.decoder.none', 'No answer — the PLC is silent.')}</p>}
          {ev.name === 'MC_READ' && (
            <div className="pl-decoded">
              End code <b>0000</b> (OK) · <b>{p.device} = {(p.values ?? []).join(', ')}</b>
            </div>
          )}
          {ev.name === 'MC_WRITE' && (
            <div className="pl-decoded">
              End code <b>0000</b> (OK) · <b>{p.device} ← {(p.values ?? []).join(', ')}</b>
            </div>
          )}
          {ev.name === 'MC_ERROR' && <div className="pl-decoded bad">End code <b>{p.end_code}</b></div>}
        </div>
      )}
    </section>
  );
}
