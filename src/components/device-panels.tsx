import type { AnySimulator } from '../simulators/registry';
import { useEffect, useRef, useState } from 'react';
import { useT, type Translate } from '../lib/i18n';
import type { TransportResponse } from '../simulators/core/types';
import { Icon } from './icon';
import { NutrunnerSimulator } from '../simulators/nutrunner/nutrunner';
import { TagReader } from '../simulators/rfid/tag-reader';
import {
  REPLACEMENT_REMARKS,
  RfidHandheldSimulator,
  type ReplacementProblem,
} from '../simulators/rfid/rfid-handheld';
import { DigitalIoSimulator, type ChannelKind } from '../simulators/digital-io/digital-io';

/**
 * Device-specific panels.
 *
 * The generic workspace covers config / controls / state / events / payloads for
 * every device. This is the one escape hatch for devices that need a purpose-built
 * view — a tightening curve, a channel grid. Devices without one render nothing.
 */
export function DevicePanel({ sim }: { sim: AnySimulator }) {
  if (sim instanceof TagReader) return <RfidTagPanel sim={sim} />;
  if (sim instanceof NutrunnerSimulator) return <NutrunnerPanel sim={sim} />;
  if (sim instanceof DigitalIoSimulator) return <DigitalIoPanel sim={sim} />;
  return null;
}

// --- rfid handheld ---------------------------------------------------------

/**
 * The tag list lives here rather than in the configuration form: edits take
 * effect on the next sweep with no Apply step, which is what you want when you
 * are adding and removing tags between scans.
 */
function RfidTagPanel({ sim }: { sim: TagReader }) {
  const handheld = sim instanceof RfidHandheldSimulator ? sim : null;
  const replacing = handheld?.replacementActive() ?? false;

  // The dropdowns belong to the host, so they are read as soon as the workspace
  // opens — and again whenever the base URL changes, which applyConfig triggers.
  useEffect(() => {
    void handheld?.ensureMasterData();
  }, [handheld]);

  return (
    <>
      {handheld && <MasterDataNotice sim={handheld} />}
      <SendResult sim={sim} />
      <TagList sim={sim} replacing={replacing} />
      {handheld && <MasterDataDialog sim={handheld} />}
      {handheld?.state.replacementOpen && <ReplacementDialog sim={handheld} />}
    </>
  );
}

/**
 * A blocking dialog while the host lists are being read — and nothing more.
 * A failed read is informative, not fatal: you can still type values by hand,
 * so it becomes a notice beside the fields instead of a wall.
 */
function MasterDataDialog({ sim }: { sim: RfidHandheldSimulator }) {
  const t = useT();
  const [dismissed, setDismissed] = useState(false);
  const loading = sim.state.master === 'loading';

  useEffect(() => {
    if (loading) setDismissed(false);
  }, [loading]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDismissed(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (!loading || dismissed) return null;
  const urls = sim.masterUrls();

  return (
    <div className="modal-backdrop" onMouseDown={() => setDismissed(true)}>
      <div className="modal" role="dialog" aria-modal="true" aria-busy onMouseDown={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <span className="panel-title">{t('master.title', 'Master Data')}</span>
          <div className="spacer" />
          <span className="status t-active">
            <span className="dot" />
            {t('master.loading', 'LOADING')}
          </span>
        </div>
        <div className="modal-body">
          <p className="modal-lede">
            {t('master.lede', 'Reading the RR types and factories this host knows about.')}
          </p>
          <p className="send-target mono">GET {urls.rrTypes}</p>
          <p className="send-target mono">GET {urls.factories}</p>
        </div>
        <div className="modal-foot">
          <span className="spacer" />
          <button type="button" className="btn" onClick={() => setDismissed(true)}>
            {t('master.hide', 'Hide')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Says the dropdowns are not the host's, without taking the workspace away. */
function MasterDataNotice({ sim }: { sim: RfidHandheldSimulator }) {
  const t = useT();
  if (sim.state.master !== 'failed') return null;
  return (
    <p className="locked-note master-note">
      <Icon name="broadcast" size={14} />
      <span>
        {t(
          'master.note',
          'The dropdowns could not be read from this host, so they fall back to built-in values. A replacement still needs a factory from the host, because it sends the factory id.',
        )}
        {sim.state.masterError ? ` — ${sim.state.masterError}` : ''}
      </span>
      <button type="button" className="btn btn-sm" onClick={() => void sim.ensureMasterData(true)}>
        {t('master.retry', 'Retry')}
      </button>
    </p>
  );
}

/**
 * Asks for the half of a replacement the scanner cannot know: which tag is being
 * retired, and why. Opened by the device when the trigger is pulled, so the form
 * cannot be skipped and the scan is already halted by the time it appears.
 */
function ReplacementDialog({ sim }: { sim: RfidHandheldSimulator }) {
  const t = useT();
  const [oldTag, setOldTag] = useState('');
  const [remark, setRemark] = useState(REPLACEMENT_REMARKS[0]);
  const [failed, setFailed] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') sim.closeReplacement();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sim]);

  const newTag = sim.newTag();
  const busy = sim.transmission.sending;
  // The device decides what is missing, so the button and the device can never
  // disagree about whether this form is ready.
  const problem = sim.replacementProblem(oldTag, remark);
  const ready = !problem && !busy;
  const response = sim.transmission.lastResponse;

  const PROBLEM_TEXT: Record<ReplacementProblem, string> = {
    'no-old-tag': t('repl.problem.old', 'Enter the tag that is being replaced.'),
    'no-new-tag': t('repl.problem.new', 'The tag list has no new tag — close this and scan one first.'),
    'no-remark': t('repl.problem.remark', 'Pick a reason.'),
    'no-factory': t('repl.problem.factory', 'Pick a Factory Code in the configuration.'),
    'unknown-factory': t(
      'repl.problem.factory.unknown',
      'That factory is not in the host master data, so its id is unknown — pick one from the dropdown.',
    ),
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    const ok = await sim.submitReplacement(oldTag, remark);
    setFailed(!ok);
  }

  return (
    <div className="modal-backdrop" onMouseDown={() => !busy && sim.closeReplacement()}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="replacement-title"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="panel-head">
          <span className="panel-title" id="replacement-title">
            {t('repl.title', 'Tag Replacement')}
          </span>
          <div className="spacer" />
          <span className="chip">{t('repl.register', 'register mode')}</span>
        </div>

        <div className="modal-body">
          <p className="modal-lede">
            {t('repl.lede', 'The scanner stopped on this tag. Tell the backend which tag it replaces.')}
          </p>

          <div className="field">
            <label>{t('repl.new', 'New tag (scanned)')}</label>
            <input className="mono-input readonly-input" value={newTag} readOnly tabIndex={-1} />
            <span className="hint">{t('repl.new.hint', 'Taken from the tag list — edit it there')}</span>
          </div>

          <div className="field">
            <label htmlFor="repl-old">{t('repl.old', 'Old tag (replaced)')}</label>
            <input
              id="repl-old"
              ref={firstField}
              className="mono-input"
              value={oldTag}
              placeholder="E2806894000050367572D095"
              autoComplete="off"
              onChange={(e) => {
                setOldTag(e.target.value);
                setFailed(false);
              }}
            />
            <span className="hint">{t('repl.old.hint', 'Typed by hand — the damaged tag cannot be read')}</span>
          </div>

          <div className="field">
            <label>{t('repl.factory', 'Factory ID')}</label>
            <input
              className="mono-input readonly-input"
              value={sim.selectedFactory() ? `${sim.factoryId()} — ${sim.selectedFactory()!.name}` : ''}
              placeholder={t('repl.factory.empty', 'pick a Factory Code in the configuration')}
              readOnly
              tabIndex={-1}
            />
            <span className="hint">{t('repl.factory.hint', 'Looked up from the host master data')}</span>
          </div>

          <div className="field">
            <label htmlFor="repl-remark">{t('repl.remark', 'Reason')}</label>
            <select id="repl-remark" value={remark} onChange={(e) => setRemark(e.target.value)}>
              {REPLACEMENT_REMARKS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {failed && response && (
            <p className="modal-error">
              {response.error ?? `${response.status} ${response.statusText} — ${response.message}`}
            </p>
          )}
          {problem && problem !== 'no-old-tag' && (
            <p className="modal-hint">{PROBLEM_TEXT[problem]}</p>
          )}
        </div>

        <div className="modal-foot">
          <span className="muted mono modal-target">POST {sim.replaceUrl()}</span>
          <button type="button" className="btn" onClick={() => sim.closeReplacement()} disabled={busy}>
            {t('repl.cancel', 'Cancel')}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!ready}
            title={problem ? PROBLEM_TEXT[problem] : undefined}
          >
            {busy ? t('repl.sending', 'Sending…') : t('repl.submit', 'Submit Replacement')}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Localised version of the transport's own explanation, with English fallback. */
function explainError(res: TransportResponse, t: Translate): string {
  const host = res.host ?? '';
  switch (res.errorCode) {
    case 'timeout':
      return t('send.err.timeout', res.error!).replace('{seconds}', String(res.timeoutSeconds ?? 15));
    case 'mixed-content':
      return t('send.err.mixed', res.error!);
    case 'unreachable':
      return t('send.err.unreachable', res.error!).replace('{host}', host);
    default:
      return res.error!;
  }
}

/**
 * The answer to "did it go through?" — verdict first, then the status line, the
 * server's own message, and where it went.
 */
function SendResult({ sim }: { sim: AnySimulator }) {
  const t = useT();
  const { sending, lastResponse: res, lastUrl, lastAt } = sim.transmission;

  const verdict = sending
    ? { tone: 'active', label: t('send.sending', 'SENDING…') }
    : !res
      ? { tone: 'neutral', label: t('send.idle', 'NO SEND YET') }
      : res.ok
        ? { tone: 'ok', label: t('send.ok', 'DELIVERED') }
        : { tone: 'error', label: t('send.fail', 'FAILED') };

  return (
    <section className="panel span-2">
      <div className="panel-head">
        <span className="panel-title">{t('send.title', 'Send Result')}</span>
        <div className="spacer" />
        <span className="chip t-ok">
          {sim.transmission.delivered} {t('send.delivered', 'delivered')}
        </span>
        <span className={`chip${sim.transmission.failed ? ' t-error' : ''}`}>
          {sim.transmission.failed} {t('send.failed', 'failed')}
        </span>
        {sim.transmission.skipped > 0 && (
          <span
            className="chip t-warn"
            title={t('send.skipped.hint', 'Interval fired while the previous request was still in flight')}
          >
            {sim.transmission.skipped} {t('send.skipped', 'skipped')}
          </span>
        )}
      </div>

      <div className={`send-result tone-${verdict.tone}`}>
        <div className="send-verdict">
          <span className={`status t-${verdict.tone}`}>
            <span className="dot" />
            {verdict.label}
          </span>
          {res && !res.error && (
            <b className="send-status">
              {res.status} {res.statusText}
            </b>
          )}
          {res && <span className="send-time">{res.durationMs} ms</span>}
        </div>

        <div className="send-detail">
          {!res && !sending && (
            <p className="muted">
              {t('send.empty', 'Trigger a scan — the response from your endpoint appears here.')}
            </p>
          )}
          {res?.error && <p className="send-message t-error">{explainError(res, t)}</p>}
          {res && !res.error && (
            <p className="send-message">
              <span className="muted">{t('send.message', 'Response')}: </span>
              {res.message || t('send.nobody', '(empty body)')}
            </p>
          )}
          {lastUrl && (
            <p className="send-target mono">
              POST {lastUrl}
              {lastAt ? ` · ${lastAt.slice(11, 23)}Z` : ''}
            </p>
          )}
        </div>
      </div>
      <p className="panel-note">
        {t(
          'send.note',
          'This request is really sent from your browser. A failure here is a real one: the endpoint refused it, is unreachable, or does not allow this page (CORS).',
        )}
      </p>
    </section>
  );
}

function TagList({ sim, replacing }: { sim: TagReader; replacing?: boolean }) {
  const t = useT();
  const tags = sim.tags();
  const coverage = sim.coverage();
  return (
    <section className="panel span-2">
      <div className="panel-head">
        <span className="panel-title">{t('rfid.title', 'Tag List')}</span>
        <span className={`chip${replacing && tags.length > 1 ? ' t-warn' : ''}`}>
          {replacing ? `${tags.length} / 1` : tags.length} {t('unit.tags', 'tags')}
        </span>
        {coverage && coverage.total > 0 && (
          <span className={`chip${coverage.covered >= coverage.total ? ' t-ok' : ''}`}>
            {coverage.covered} / {coverage.total} {t('rfid.covered', 'reported')}
          </span>
        )}
        <div className="spacer" />
        <span className="chip t-ok">{t('rfid.live', 'applies instantly')}</span>
        <button type="button" className="btn btn-sm" onClick={() => sim.addRandomTag()}>
          <Icon name="bolt" size={13} />
          {t('rfid.generate', 'Generate Random Tag')}
        </button>
      </div>
      <div className="panel-body">
        <div className="field">
          <label htmlFor="rfid-tags">
            {replacing
              ? t('rfid.label.one', 'Scanned tag — the new tag that replaces the old one')
              : t('rfid.label', 'Scanned tags — one EPC per line')}
          </label>
          {replacing ? (
            // One tag, so one line: the control itself makes the rule obvious.
            <input
              id="rfid-tags"
              className="mono-input"
              spellCheck={false}
              value={sim.state.tagsText}
              placeholder={t('rfid.placeholder', 'E280689400004025A987A05A')}
              onChange={(e) => sim.setTagsText(e.target.value.replace(/\n/g, ''))}
            />
          ) : (
            <textarea
              id="rfid-tags"
              className="mono-input tag-input"
              spellCheck={false}
              value={sim.state.tagsText}
              placeholder={t('rfid.placeholder', 'E280689400004025A987A05A')}
              onChange={(e) => sim.setTagsText(e.target.value)}
            />
          )}
        </div>
      </div>
      <p className="panel-note">
        {replacing
          ? t(
              'rfid.note.replace',
              'Pull the trigger and the scanner stops, then asks which tag this one replaces. The replacement is posted to the replace endpoint, not to the scan endpoint.',
            )
          : coverage
          ? t(
              'rfid.note.gate',
              'The gate reports only what its antennas caught in each interval, so tags arrive spread over several sweeps and repeat while still in the field. Edits apply to the next sweep — no Apply Configuration needed.',
            )
          : t(
              'rfid.note',
              'Every sweep posts this whole list as the idHex array — one request per sweep, not one per tag. No Apply Configuration needed.',
            )}
      </p>
    </section>
  );
}

// --- nutrunner -------------------------------------------------------------

function NutrunnerPanel({ sim }: { sim: NutrunnerSimulator }) {
  const t = useT();
  const { phase, torque, angle, curve } = sim.state;
  const unit = sim.cfg('torqueUnit');
  const target = sim.num('targetTorque');
  const tol = sim.num('tolerance') / 100;
  const scaleMax = Math.max(target * 1.6, torque * 1.05, 0.1);
  const pct = (v: number) => `${Math.min(100, (v / scaleMax) * 100)}%`;

  const resultNode = phase === 'NG' ? 'NG' : phase === 'ERROR' ? 'ERROR' : 'OK';
  const nodes = ['READY', 'TIGHTENING', resultNode];
  const currentIndex =
    phase === 'TIGHTENING' ? 1 : phase === 'OK' || phase === 'NG' || phase === 'ERROR' ? 2 : 0;
  const fillTone = phase === 'OK' ? 'ok' : phase === 'NG' || phase === 'ERROR' ? 'ng' : '';

  return (
    <section className="panel span-2">
      <div className="panel-head">
        <span className="panel-title">{t('np.title', 'Tightening Sequence')}</span>
        <div className="spacer" />
        <span className="chip">
          {t('np.target', 'target')} {target} {unit}
        </span>
        <span className="chip">± {sim.num('tolerance')}%</span>
      </div>
      <div className="panel-body">
        <div className="phase-chain">
          {nodes.map((node, i) => (
            <span key={node} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {i > 0 && <span className="phase-arrow">→</span>}
              <span
                className={[
                  'phase-node',
                  i < currentIndex ? 'done' : '',
                  i === currentIndex ? 'current' : '',
                  i === currentIndex && node === 'OK' ? 'ok' : '',
                  i === currentIndex && node === 'NG' ? 'ng' : '',
                  i === currentIndex && node === 'ERROR' ? 'err' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {node}
              </span>
            </span>
          ))}
        </div>

        <div className="readouts">
          <div className="readout">
            <span>{t('np.torque', 'Torque')}</span>
            <b>
              {torque.toFixed(1)} <small style={{ fontSize: 12, color: 'var(--ink-3)' }}>{unit}</small>
            </b>
          </div>
          <div className="readout">
            <span>{t('np.angle', 'Angle')}</span>
            <b>{angle}°</b>
          </div>
          <div className="readout">
            <span>{t('np.phase', 'Phase')}</span>
            <b className={phase === 'NG' || phase === 'ERROR' ? 't-error' : phase === 'OK' ? 't-ok' : ''}>
              {phase}
            </b>
          </div>
          <div className="readout">
            <span>{t('np.cycle', 'Cycle')}</span>
            <b>{sim.state.cycle}</b>
          </div>
        </div>

        <div className="torque-track">
          <div
            className="torque-band"
            style={{ left: pct(target * (1 - tol)), width: pct(target * 2 * tol) }}
            title={`${t('np.window', 'Accept window')} ${(target * (1 - tol)).toFixed(1)} – ${(target * (1 + tol)).toFixed(1)} ${unit}`}
          />
          <div className="torque-target" style={{ left: pct(target) }}>
            <span>
              {t('np.target', 'target')} {target}
            </span>
          </div>
          <div className={`torque-fill ${fillTone}`} style={{ width: pct(torque) }} />
          {curve.length > 1 && (
            // The trace shares the bar's axis: it is compressed into the span
            // already reached, so it always ends exactly at the live bar edge.
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              aria-hidden="true"
            >
              <polyline
                points={curve
                  .map((v, i) => {
                    const span = Math.min(100, (torque / scaleMax) * 100);
                    const x = (i / (curve.length - 1)) * span;
                    return `${x},${100 - Math.min(100, (v / scaleMax) * 100)}`;
                  })
                  .join(' ')}
                fill="none"
                stroke="var(--ink-2)"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
                opacity="0.5"
              />
            </svg>
          )}
        </div>
        <div className="torque-scale">
          <span>0</span>
          <span>{(scaleMax / 2).toFixed(0)}</span>
          <span>
            {scaleMax.toFixed(0)} {unit}
          </span>
        </div>
      </div>
      <p className="panel-note">
        {t(
          'np.note',
          'Green band is the accept window. The trace is the torque ramp of the current cycle; the bar edge is the live reading.',
        )}
      </p>
    </section>
  );
}

// --- digital i/o -----------------------------------------------------------

function DigitalIoPanel({ sim }: { sim: DigitalIoSimulator }) {
  const t = useT();
  return (
    <>
      {sim.restMode() && <SendResult sim={sim} />}
      <IoChannels sim={sim} t={t} />
    </>
  );
}

function IoChannels({ sim, t }: { sim: DigitalIoSimulator; t: Translate }) {
  return (
    <section className="panel span-2">
      <div className="panel-head">
        <span className="panel-title">{t('io.title', 'I/O Channels')}</span>
        <div className="spacer" />
        <span className="chip">{t('io.hint', 'click a channel to toggle it')}</span>
      </div>
      <div className="panel-body">
        <div className="io-columns">
          <ChannelBlock sim={sim} kind="DI" title={t('io.inputs', 'Inputs')} channels={sim.state.inputs} />
          <ChannelBlock sim={sim} kind="DO" title={t('io.outputs', 'Outputs')} channels={sim.state.outputs} />
        </div>
      </div>
      <p className="panel-note">
        {sim.restMode()
          ? t(
              'io.note.rest',
              'Inputs model field signals (sensors, buttons); outputs model driven loads (valves, lamps). Every transition is really posted to the REST endpoint, and the response is shown above.',
            )
          : t(
              'io.note',
              'Inputs model field signals (sensors, buttons); outputs model driven loads (valves, lamps). Every transition is logged and framed for the configured transport.',
            )}
      </p>
    </section>
  );
}

function ChannelBlock({
  sim,
  kind,
  title,
  channels,
}: {
  sim: DigitalIoSimulator;
  kind: ChannelKind;
  title: string;
  channels: boolean[];
}) {
  const t = useT();
  const on = channels.filter(Boolean).length;
  return (
    <div>
      <div className="io-legend">
        <h4>{title}</h4>
        <span className="muted" style={{ fontSize: 12 }}>
          {on} {t('io.of', 'of')} {channels.length} ON
        </span>
      </div>
      <div className="io-channels">
        {channels.map((value, i) => {
          const name = sim.channelName(kind, i);
          return (
            <button
              key={name}
              type="button"
              className={`io-channel${value ? ' on' : ''}`}
              onClick={() => sim.toggle(kind, i)}
              aria-pressed={value}
              title={`${t('io.toggle', 'Toggle')} ${name}`}
            >
              <span className="led" />
              {name}
              <span className="io-value">{value ? 'ON' : 'OFF'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
