import { useEffect, useState } from 'react';
import type { ChannelKind, DigitalIoSimulator, ModbusAdu } from '../../simulators/digital-io/digital-io';
import type { SimEvent } from '../../simulators/core/types';
import { useSimulator } from '../../lib/use-simulator';
import { useT } from '../../lib/i18n';
import { useComments } from '../../lib/use-comments';
import { EventStream, PayloadInspector } from '../event-stream';
import { SendResult } from '../send-result';
import { CommunicationLog, ConfigPanel } from '../workspace';
import { DioScene, inputDevice, outputName } from './dio-scene';
import './dio.css';

/**
 * The digital I/O workspace: the ESP32 + W5500 box with its field devices
 * beside the Modbus process image and the last frame taken apart, then a
 * table per direction. Modbus and MQTT frames are generated; REST is sent.
 */
export function DigitalIoWorkspace({ sim }: { sim: DigitalIoSimulator }) {
  useSimulator(sim);
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const selected: SimEvent | null = sim.events.find((e) => e.seq === selectedSeq) ?? sim.events[0] ?? null;

  // The box is powered as soon as it is opened.
  useEffect(() => {
    if (sim.status === 'OFFLINE') sim.applyConfig({});
  }, [sim]);

  return (
    <>
      <StatusBar sim={sim} />
      <div className="dio-top">
        <DioScene sim={sim} />
        <ProcessImage sim={sim} />
      </div>
      {sim.restMode() && (
        <div className="ws-row">
          <SendResult sim={sim} />
        </div>
      )}
      <div className="dio-tables">
        <Channels sim={sim} kind="DI" />
        <Channels sim={sim} kind="DO" />
      </div>
      <div className="ws-row stream-inspect">
        <EventStream
          events={sim.events}
          selectedSeq={selected?.seq ?? null}
          onSelect={setSelectedSeq}
          onClear={() => {
            sim.clearEvents();
            setSelectedSeq(null);
          }}
        />
        <PayloadInspector event={selected} fallback={sim.samplePayload()} />
      </div>
      <div className="ws-row">
        <CommunicationLog events={sim.events} />
      </div>
    </>
  );
}

function StatusBar({ sim }: { sim: DigitalIoSimulator }) {
  const t = useT();
  const [settings, setSettings] = useState(false);
  const transport = sim.cfg('transport');
  const online = sim.status !== 'OFFLINE';
  const field = (key: string) => sim.configFields.find((f) => f.key === key)?.options ?? [];
  return (
    <>
      <section className="panel dio-status">
        <span className={`dio-dot${online ? ' on' : ''}`} />
        <span className="dio-kv">
          <span className="muted">{t('dio.module', 'Module')}</span>{' '}
          <b>
            {sim.cfg('deviceId')} · {transport === 'REST' ? sim.cfg('endpoint') : transport === 'MQTT' ? sim.cfg('topic') : `${sim.cfg('ip')}:${sim.num('port')}`}
          </b>
        </span>
        {transport === 'Modbus TCP' && (
          <span className="dio-kv">
            <span className="muted">Unit</span> <b>1</b>
          </span>
        )}
        <label className="dio-kv">
          <span className="muted">{t('dio.transport', 'Transport')}</span>{' '}
          <select className="dio-select" value={transport} onChange={(e) => sim.applyConfig({ transport: e.target.value })}>
            {field('transport').map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <label className="dio-kv">
          <span className="muted">{t('dio.channels', 'Channels')}</span>{' '}
          <select className="dio-select" value={sim.cfg('channels')} onChange={(e) => sim.applyConfig({ channels: e.target.value })}>
            {field('channels').map((o) => (
              <option key={o} value={o}>
                {o} DI / {o} DO
              </option>
            ))}
          </select>
        </label>
        <span className="spacer" />
        <span className={`chip${sim.restMode() ? ' t-ok' : ''}`}>
          {sim.restMode() ? t('dio.sent', 'changes really sent') : t('dio.generated', 'frames generated, not sent')}
        </span>
        <button type="button" className="btn btn-sm" aria-expanded={settings} onClick={() => setSettings((v) => !v)}>
          ⚙ {t('dio.settings', 'Settings')}
        </button>
      </section>
      {/* Keyed on the inline selects so the form never shows them as unapplied. */}
      {settings && <ConfigPanel key={`${transport}:${sim.cfg('channels')}`} sim={sim} />}
    </>
  );
}

const addr = (kind: ChannelKind, i: number) => (kind === 'DI' ? String(10001 + i) : String(1 + i).padStart(5, '0'));

/** The Modbus view of the box: both bit tables, their words, the last frame. */
function ProcessImage({ sim }: { sim: DigitalIoSimulator }) {
  const t = useT();
  const st = sim.state;
  const n = st.inputs.length;
  const bits = (kind: ChannelKind, list: boolean[]) => (
    <div className={`dio-bits ${kind === 'DO' ? 'do' : ''}`}>
      {list.map((on, i) => (
        <button
          type="button"
          key={i}
          className={on ? 'on' : ''}
          aria-pressed={on}
          title={`${sim.channelName(kind, i)} · ${addr(kind, i)}`}
          onClick={() => sim.toggle(kind, i)}
        >
          <b>{on ? 1 : 0}</b>
          {addr(kind, i)}
        </button>
      ))}
    </div>
  );
  const last = sim.events.find((e) => e.transport)?.transport;
  return (
    <section className="panel dio-pi">
      <div className="panel-head">
        <span className="panel-title">{t('dio.pi', 'Process Image')}</span>
        <span className="chip">{t('dio.map', 'Modbus map')}</span>
        <span className="spacer" />
        <span className="chip">unit 1</span>
      </div>
      <div className="dio-pi-body">
        <div>
          <h4>
            {t('dio.di', 'Discrete inputs')} · FC02 <span className="muted">10001 – {10000 + n}</span>
            <b>{sim.wordOf(st.inputs)}</b>
          </h4>
          {bits('DI', st.inputs)}
        </div>
        <div>
          <h4>
            {t('dio.coils', 'Coils')} · FC01 / FC05 <span className="muted">00001 – {String(n).padStart(5, '0')}</span>
            <b>{sim.wordOf(st.outputs)}</b>
          </h4>
          {bits('DO', st.outputs)}
        </div>
        {sim.cfg('transport') === 'Modbus TCP' ? (
          <Frame adu={st.adu} sim={sim} />
        ) : (
          <div>
            <h4>
              {t('dio.last', 'Last frame')} <span className="muted">{last?.protocol ?? sim.cfg('transport')}</span>
            </h4>
            {last ? (
              <pre className="dio-pre">{last.detail}</pre>
            ) : (
              <p className="muted dio-empty">{t('dio.frame.empty', 'Switch a device: the frame it puts on the wire appears here.')}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

type Part = { bytes: number[]; kind: number; text: string };

/** The ADU split into MBAP header and PDU fields, each with what it means. */
function split(adu: ModbusAdu, sim: DigitalIoSimulator): Part[] {
  const b = adu.bytes;
  const w = (i: number) => (b[i] << 8) | b[i + 1];
  const parts: Part[] = [
    { bytes: b.slice(0, 2), kind: 1, text: `Transaction id ${w(0)} · MBAP header` },
    { bytes: b.slice(2, 4), kind: 2, text: 'Protocol id — always 0 for Modbus' },
    { bytes: b.slice(4, 6), kind: 1, text: `Length — ${w(4)} bytes follow` },
    { bytes: b.slice(6, 7), kind: 3, text: `Unit id ${b[6]}` },
  ];
  const coils = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => sim.channelName('DO', from + i)).join(', ');
  if (adu.fc === 0x02) {
    parts.push(
      { bytes: [b[7]], kind: 4, text: 'Function 02 — read discrete inputs (reply)' },
      { bytes: [b[8]], kind: 5, text: `Byte count ${b[8]}` },
      { bytes: b.slice(9), kind: 6, text: 'Input status, DI01 = bit 0 of the first byte' },
    );
  } else if (adu.fc === 0x05) {
    parts.push(
      { bytes: [b[7]], kind: 4, text: 'Function 05 — write single coil' },
      { bytes: b.slice(8, 10), kind: 5, text: `Coil address ${w(8)} → ${coils(w(8), 1)} (${addr('DO', w(8))})` },
      { bytes: b.slice(10, 12), kind: 6, text: `Value ${b[10] ? 'ON' : 'OFF'} (FF 00 = ON, 00 00 = OFF)` },
    );
  } else {
    parts.push(
      { bytes: [b[7]], kind: 4, text: 'Function 15 — write multiple coils' },
      { bytes: b.slice(8, 10), kind: 5, text: `Start address ${w(8)}` },
      { bytes: b.slice(10, 12), kind: 5, text: `Quantity ${w(10)}` },
      { bytes: [b[12]], kind: 5, text: `Byte count ${b[12]}` },
      { bytes: b.slice(13), kind: 6, text: 'Coil values, DO01 = bit 0 of the first byte' },
    );
  }
  return parts;
}

const hex = (bytes: number[]) => bytes.map((v) => v.toString(16).toUpperCase().padStart(2, '0')).join(' ');

function Frame({ adu, sim }: { adu: ModbusAdu | null; sim: DigitalIoSimulator }) {
  const t = useT();
  if (!adu) {
    return (
      <div>
        <h4>{t('dio.last', 'Last frame')}</h4>
        <p className="muted dio-empty">{t('dio.frame.empty', 'Switch a device: the frame it puts on the wire appears here.')}</p>
      </div>
    );
  }
  const parts = split(adu, sim);
  return (
    <div>
      <h4>
        {t('dio.last', 'Last frame')} <span className="muted">{adu.note}</span>
        <b>
          {adu.bytes.length} {t('dio.bytes', 'bytes')}
        </b>
      </h4>
      <div className="dio-frame">
        {parts.map((p, i) => (
          <span key={i} className={`dio-k${p.kind}`}>
            {hex(p.bytes)}
          </span>
        ))}
      </div>
      <div className="dio-legend">
        {parts.map((p, i) => (
          <div key={i}>
            <i className={`dio-k${p.kind}`}>{hex(p.bytes)}</i>
            <span>{p.text}</span>
          </div>
        ))}
      </div>
      <p className="muted dio-note">
        {t('dio.frame.note', 'FC02 is the reply to the master polling the inputs; FC05 / FC15 are the master writing coils.')}
      </p>
    </div>
  );
}

const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour12: false }) : '—');

function Channels({ sim, kind }: { sim: DigitalIoSimulator; kind: ChannelKind }) {
  const t = useT();
  const st = sim.state;
  const list = kind === 'DI' ? st.inputs : st.outputs;
  const [comments, setComment] = useComments('shs.dio.comments');
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">{kind === 'DI' ? t('dio.inputs', 'Inputs') : t('dio.outputs', 'Outputs')}</span>
        <span className="chip">
          {list.filter(Boolean).length} / {list.length} ON
        </span>
      </div>
      <div className="dio-table-wrap">
        <table className="dio-table">
          <thead>
            <tr>
              <th>Ch</th>
              <th>{t('dio.addr', 'Address')}</th>
              <th>{t('dio.device', 'Field device')}</th>
              <th>{t('dio.comment', 'Comment')}</th>
              <th>{t('dio.state', 'State')}</th>
              <th>{t('dio.changes', 'Changes')}</th>
              <th>{t('dio.lastchange', 'Last change')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((on, i) => {
              const ch = sim.channelName(kind, i);
              return (
                <tr key={ch}>
                  <td className="mono">
                    <b>{ch}</b>
                  </td>
                  <td className="mono">{addr(kind, i)}</td>
                  <td>{kind === 'DI' ? inputDevice(i).name : outputName(i)}</td>
                  <td>
                    <input
                      className="dio-comment"
                      value={comments[ch] ?? ''}
                      placeholder={t('dio.comment.hint', 'add a comment')}
                      aria-label={`${ch} comment`}
                      onChange={(e) => setComment(ch, e.target.value)}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`dio-pill${on ? ` on ${kind.toLowerCase()}` : ''}`}
                      aria-pressed={on}
                      onClick={() => sim.toggle(kind, i)}
                    >
                      {on ? 'ON' : 'OFF'}
                    </button>
                  </td>
                  <td className="mono">{st.hits[kind][i]}</td>
                  <td className="mono">{clock(st.at[kind][i])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
