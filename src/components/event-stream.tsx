import { useMemo, useState } from 'react';
import type { SimEvent } from '../simulators/core/types';
import { Icon } from './icon';
import { CopyButton } from './copy-button';

const clock = (iso: string) => iso.slice(11, 19);

interface StreamProps {
  events: SimEvent[];
  selectedSeq: number | null;
  onSelect: (seq: number) => void;
  onClear: () => void;
}

/**
 * Live event stream. Pausing freezes the visible list without stopping the
 * device — the simulation keeps running, you just stop the log from moving.
 */
export function EventStream({ events, selectedSeq, onSelect, onClear }: StreamProps) {
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState<SimEvent[]>([]);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const source = paused ? frozen : events;
  const q = filter.trim().toLowerCase();
  const visible = useMemo(
    () =>
      q
        ? source.filter(
            (e) => e.name.toLowerCase().includes(q) || (e.summary ?? '').toLowerCase().includes(q),
          )
        : source,
    [source, q],
  );

  function togglePause() {
    if (paused) setPaused(false);
    else {
      setFrozen(events);
      setPaused(true);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">Event Stream</span>
        <span className="chip">{events.length} events</span>
        {paused && <span className="chip t-warn">paused</span>}
        <div className="spacer" />
        <div className="stream-toolbar">
          <input
            className="filter-input"
            placeholder="Filter events"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter events"
          />
          <button className="btn btn-sm" onClick={togglePause} type="button">
            <Icon name={paused ? 'play' : 'pause'} size={13} />
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button className="btn btn-sm" onClick={onClear} type="button" disabled={!events.length}>
            <Icon name="trash" size={13} />
            Clear
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="empty">
          {events.length === 0
            ? 'No events yet. Trigger a device action to produce one.'
            : 'No events match this filter.'}
        </p>
      ) : (
        <div className="stream">
          {visible.map((e) => (
            <div key={e.seq} className={`event${e.seq === selectedSeq ? ' selected' : ''}`}>
              <button
                className="event-row"
                onClick={() => {
                  onSelect(e.seq);
                  setExpanded(expanded === e.seq ? null : e.seq);
                }}
                aria-expanded={expanded === e.seq}
                type="button"
              >
                <span className="event-time">{clock(e.timestamp)}</span>
                <span className={`event-name t-${e.tone}`}>{e.name}</span>
                <span className="event-summary">{e.summary}</span>
                <Icon name="chevron" size={13} className="event-caret" />
              </button>
              {expanded === e.seq && (
                <div className="event-detail">
                  <pre className="code inline">{JSON.stringify(envelope(e), null, 2)}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="panel-note">
        Newest first · click a row to inspect it · timestamps are ISO-8601 UTC
      </p>
    </section>
  );
}

/** The event envelope every simulator shares. */
export function envelope(e: SimEvent) {
  return {
    event: e.name,
    device: e.device,
    timestamp: e.timestamp,
    payload: e.payload,
  };
}

type Tab = 'payload' | 'transport' | 'event';

interface InspectorProps {
  event: SimEvent | null;
  fallback: Record<string, unknown>;
}

/**
 * Payload inspector. Today: JSON payload, the wire frame the device would have
 * sent, and the raw event envelope. The tab list is where WebSocket / MQTT /
 * Modbus views land later — they are just more frames.
 */
export function PayloadInspector({ event, fallback }: InspectorProps) {
  const [tab, setTab] = useState<Tab>('payload');
  const active: Tab = tab === 'transport' && !event?.transport ? 'payload' : tab;

  const text =
    !event
      ? JSON.stringify(fallback, null, 2)
      : active === 'payload'
        ? JSON.stringify(event.payload, null, 2)
        : active === 'event'
          ? JSON.stringify(envelope(event), null, 2)
          : (event.transport?.detail ?? '');

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="panel-title">Payload Inspector</span>
        <div className="spacer" />
        <div className="tabs" role="tablist" aria-label="Payload views">
          {(
            [
              ['payload', 'Payload'],
              ['transport', event?.transport ? event.transport.protocol : 'Wire'],
              ['event', 'Event'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              type="button"
              className="tab"
              aria-selected={active === id}
              disabled={id === 'transport' && !event?.transport}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <CopyButton text={text} />
      </div>
      {event ? (
        <p className="panel-note" style={{ borderTop: 0, borderBottom: '1px solid var(--line)' }}>
          <span className="mono">{event.name}</span> · seq {event.seq} ·{' '}
          {event.transport ? event.transport.summary : 'no transport frame'}
        </p>
      ) : (
        <p className="panel-note" style={{ borderTop: 0, borderBottom: '1px solid var(--line)' }}>
          Example payload — run an action to inspect a real one.
        </p>
      )}
      <pre className="code">{text}</pre>
    </section>
  );
}
