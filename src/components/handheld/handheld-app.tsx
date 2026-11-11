import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Config } from '../../simulators/core/simulator';
import {
  BASE_URLS,
  ENDPOINTS,
  REPLACEMENT_REMARKS,
  quality,
  type Quality,
  type ReadTag,
  type RfidHandheldSimulator,
  type SendFailure,
  type SendLog,
} from '../../simulators/rfid/rfid-handheld';
import { appStrings, type AppStrings } from './app-strings';

/**
 * The WMS RFID Suite app, drawn at the MC33's native 480×800 and scaled into
 * the device screen, so every size here is the size in the screenshots.
 */
export function HandheldApp({ sim }: { sim: RfidHandheldSimulator }) {
  const s = appStrings(sim.cfg('lang'));
  const [screen, setScreen] = useState<'scan' | 'settings'>('scan');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const say = (text: string) => {
    clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Android back / home, wired to the nav bar and handed to the settings screen.
  const back = useRef<() => void>(() => {});

  return (
    <div className="app">
      <StatusBar lang={sim.cfg('lang')} />
      <div className="app-body">
        {screen === 'scan' ? (
          <ScanScreen sim={sim} s={s} openSettings={() => setScreen('settings')} say={say} />
        ) : (
          <SettingsScreen sim={sim} s={s} close={() => setScreen('scan')} say={say} backRef={back} />
        )}
      </div>
      <nav className="app-nav" aria-label="Android navigation">
        <button type="button" aria-label="Back" onClick={() => (screen === 'settings' ? back.current() : undefined)}>
          <svg viewBox="0 0 24 24"><path d="M17 4 6 12l11 8z" /></svg>
        </button>
        <button type="button" aria-label="Home" onClick={() => (screen === 'settings' ? back.current() : undefined)}>
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.5" /></svg>
        </button>
        <button type="button" aria-label="Recent apps">
          <svg viewBox="0 0 24 24"><rect x="5.5" y="5.5" width="13" height="13" rx="1" /></svg>
        </button>
      </nav>
      {toast && <div className="app-toast">{toast}</div>}
    </div>
  );
}

// --- chrome ----------------------------------------------------------------------

function StatusBar({ lang }: { lang: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return (
    <div className="app-status">
      <svg viewBox="0 0 24 24" className="sb-ic"><path d="M3 6h18v12H3zM3 6l9 7 9-7" fill="none" strokeWidth="2.4" stroke="currentColor" /></svg>
      <svg viewBox="0 0 24 24" className="sb-ic"><path d="M7 18a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9z" /></svg>
      <span className="sb-gap" />
      <svg viewBox="0 0 24 24" className="sb-ic wide"><path d="M12 20 1 7.5Q12-1.5 23 7.5z" /></svg>
      <span>87%</span>
      <svg viewBox="0 0 24 24" className="sb-ic"><path d="M9 2h6v2h2v18H7V4h2z" /></svg>
      <span>{lang === 'en' ? `${hh}:${mm}` : `${hh}.${mm}`}</span>
    </div>
  );
}

function AppBar({ title, onBack, action }: { title: string; onBack?: () => void; action?: ReactNode }) {
  return (
    <header className={`app-bar${onBack ? ' with-back' : ''}`}>
      {onBack && (
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}>
          <svg viewBox="0 0 24 24"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z" /></svg>
        </button>
      )}
      <h1>{title}</h1>
      {action}
    </header>
  );
}

function Gear() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />
    </svg>
  );
}

function Dialog({ title, children, actions, wide }: { title: string; children?: ReactNode; actions: ReactNode; wide?: boolean }) {
  return (
    <div className="app-scrim" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`app-dialog${wide ? ' wide' : ''}`}>
        <h2>{title}</h2>
        {children}
        <div className="dlg-actions">{actions}</div>
      </div>
    </div>
  );
}

const clock = (iso: string | null, lang: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return lang === 'en' ? `${hh}:${mm}` : `${hh}.${mm}`;
};

/** wms.suite.stechoq-j.com → wms.suite, as on the chip. */
function shortHost(base: string): string {
  try {
    const host = new URL(base).hostname;
    const parts = host.split('.');
    return parts.length > 2 ? parts.slice(0, 2).join('.') : host;
  } catch {
    return base || '—';
  }
}

/** One line, the way the app phrases a failed send. */
export function failureText(f: SendFailure, count: number, s: AppStrings): { text: string; tone: 'error' | 'info' } {
  if (f.status === 500) return { text: s.notSentPrefix(count) + s.systemError, tone: 'error' };
  if (f.status === 0) return { text: s.notSentPrefix(count) + s.networkError, tone: 'error' };
  return { text: s.notSentPrefix(count) + (f.message || `HTTP ${f.status}`), tone: 'info' };
}

// --- scan screen ------------------------------------------------------------------

type Sort = 'newest' | 'epc' | 'reads' | 'quality';
const QUALITY_RANK: Record<Quality, number> = { strong: 0, medium: 1, weak: 2 };

function ScanScreen({
  sim,
  s,
  openSettings,
  say,
}: {
  sim: RfidHandheldSimulator;
  s: AppStrings;
  openSettings: () => void;
  say: (t: string) => void;
}) {
  const st = sim.state;
  const lang = sim.cfg('lang');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [sortOpen, setSortOpen] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    const list = q ? st.session.filter((t) => t.epc.includes(q)) : [...st.session];
    const by: Record<Sort, (a: ReadTag, b: ReadTag) => number> = {
      newest: (a, b) => b.firstSeen.localeCompare(a.firstSeen),
      epc: (a, b) => a.epc.localeCompare(b.epc),
      reads: (a, b) => b.reads - a.reads,
      quality: (a, b) => QUALITY_RANK[quality(a)] - QUALITY_RANK[quality(b)] || b.rssi - a.rssi,
    };
    return list.sort(by[sort]);
  }, [st.session, query, sort]);

  const rr = sim.cfg('rr_type');
  const factory = sim.cfg('factory_code');
  const chips: { label: string; tone?: 'warn' | 'error' }[] = [
    { label: 'RFID' },
    { label: sim.cfg('mode') === 'register' ? 'Register' : 'WO' },
    ...(sim.bool('opname') ? [{ label: 'Opname' }] : []),
    ...(sim.replacementActive() ? [{ label: s.replacementChip, tone: 'warn' as const }] : []),
    { label: rr || 'RR Type', tone: rr ? undefined : ('error' as const) },
    { label: factory || 'Factory', tone: factory ? undefined : ('error' as const) },
    { label: shortHost(sim.cfg('baseUrl')) },
  ];

  const unsent = sim.unsent();
  const fail = unsent && st.failure ? failureText(st.failure, st.session.length, s) : null;
  const busy = st.send === 'sending';

  return (
    <>
      <AppBar
        title={s.appTitle}
        action={
          <button type="button" className="icon-btn" aria-label={s.settings} onClick={openSettings}>
            <Gear />
          </button>
        }
      />
      <div className="chips" role="button" tabIndex={0} onClick={openSettings} onKeyDown={(e) => e.key === 'Enter' && openSettings()}>
        {chips.map((c, i) => (
          <span key={i} className={`chip${c.tone ? ` ${c.tone}` : ''}`}>
            {c.label}
          </span>
        ))}
      </div>

      <section className="summary">
        <div className="summary-line">
          <span className="counts">
            <b>{st.session.length}</b> {s.unique} · <b>{sim.detected()}</b> {s.detected}
          </span>
          {st.send === 'sending' && <span className="st sending">{s.sending}</span>}
          {st.send === 'sent' && st.session.length > 0 && (
            <span className="st ok">✓ {s.sent} {clock(st.lastScanAt, lang)}</span>
          )}
          {st.send === 'failed' && st.session.length > 0 && <span className="st bad">✗ {clock(st.lastScanAt, lang)}</span>}
        </div>
        {st.scanning ? (
          <button type="button" className="m-btn filled stop" onClick={() => sim.stopButton()}>
            <svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" /></svg>
            {s.stopScan}
          </button>
        ) : st.session.length === 0 ? (
          <button type="button" className="m-btn filled" disabled={!sim.canStart()} onClick={() => sim.startButton()}>
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            {s.startScan}
          </button>
        ) : (
          <div className="btn-pair">
            <button type="button" className="m-btn outlined" disabled={busy} onClick={() => sim.newScan()}>
              {s.newScan}
            </button>
            <button type="button" className="m-btn filled" disabled={busy} onClick={() => sim.continueScan()}>
              {s.continue}
            </button>
          </div>
        )}
        {fail && (
          <div className="fail-line">
            <span className={fail.tone}>{fail.text}</span>
            <button type="button" className="m-btn outlined small" onClick={() => void sim.send()}>
              {s.resend}
            </button>
          </div>
        )}
      </section>

      <div className="search-row">
        <label className="search">
          <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" /></svg>
          <input value={query} placeholder={s.search} onChange={(e) => setQuery(e.target.value)} spellCheck={false} />
        </label>
        <button type="button" className="icon-btn" aria-label="Sort" onClick={() => setSortOpen((v) => !v)}>
          <svg viewBox="0 0 24 24"><path d="M3 18h6v-2H3zM3 6v2h18V6zm0 7h12v-2H3z" /></svg>
        </button>
        {sortOpen && (
          <ul className="menu" role="menu">
            {(
              [
                ['newest', s.sortNewest],
                ['epc', s.sortEpc],
                ['reads', s.sortReads],
                ['quality', s.sortQuality],
              ] as [Sort, string][]
            ).map(([id, label]) => (
              <li key={id}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={sort === id}
                  onClick={() => {
                    setSort(id);
                    setSortOpen(false);
                  }}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="tag-list">
        {st.session.length === 0 ? (
          <p className="empty">{s.noTags}</p>
        ) : rows.length === 0 ? (
          <p className="empty">{s.noMatch}</p>
        ) : (
          rows.map((t) => <TagRow key={t.epc} tag={t} s={s} say={say} />)
        )}
      </div>

      {st.prompt && (
        <Dialog
          title={s.unsentTitle}
          actions={
            <>
              <button type="button" className="text-btn" onClick={() => sim.answerPrompt('cancel')}>
                {s.cancel}
              </button>
              <button type="button" className="text-btn danger" onClick={() => sim.answerPrompt('discard')}>
                {s.discard}
              </button>
              <button type="button" className="m-btn filled small" onClick={() => sim.answerPrompt('send')}>
                {s.sendFirst}
              </button>
            </>
          }
        >
          <p className="dlg-body">{s.unsentBody(st.session.length)}</p>
        </Dialog>
      )}
      {st.replacementOpen && <ReplacementForm sim={sim} s={s} />}
    </>
  );
}

const QUALITY_LABEL = (q: Quality, s: AppStrings) => (q === 'strong' ? s.strong : q === 'medium' ? s.medium : s.weak);

function TagRow({ tag, s, say }: { tag: ReadTag; s: AppStrings; say: (t: string) => void }) {
  const q = quality(tag);
  return (
    <div className="tag-row">
      <div className="tag-main">
        <div className="epc-line">
          <span className="epc">{tag.epc}</span>
          <span className={`age${tag.isNew ? '' : ' old'}`}>{tag.isNew ? s.isNew : s.isOld}</span>
        </div>
        <div className="meta-line">
          <span>R:{tag.reads}</span>
          <span className={`q ${q}`}>
            {s.quality}: {QUALITY_LABEL(q, s)}
          </span>
        </div>
      </div>
      <button
        type="button"
        className="icon-btn"
        aria-label="Copy EPC"
        onClick={() => {
          void navigator.clipboard?.writeText(tag.epc).catch(() => {});
          say(s.copied);
        }}
      >
        <svg viewBox="0 0 24 24"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11z" /></svg>
      </button>
    </div>
  );
}

function ReplacementForm({ sim, s }: { sim: RfidHandheldSimulator; s: AppStrings }) {
  const st = sim.state;
  const [old, setOld] = useState('');
  const [remark, setRemark] = useState(REPLACEMENT_REMARKS[0]);
  const noFactory = !sim.selectedFactory();
  const fail = st.replacementFailure ? failureText(st.replacementFailure, 1, s) : null;
  return (
    <Dialog
      title={s.replTitle}
      wide
      actions={
        <>
          <button type="button" className="text-btn" onClick={() => sim.closeReplacement()}>
            {s.cancel}
          </button>
          <button
            type="button"
            className="m-btn filled small"
            disabled={!old.trim() || noFactory || st.replacementSending}
            onClick={() => void sim.submitReplacement(old, remark)}
          >
            {st.replacementSending ? s.sending : s.send}
          </button>
        </>
      }
    >
      <p className="field-cap">{s.replNew}</p>
      <p className="new-epc">{st.replacementTag}</p>
      <Outlined label={s.replOld} help={s.replOldHelp}>
        <input value={old} onChange={(e) => setOld(e.target.value)} spellCheck={false} autoFocus />
      </Outlined>
      <Outlined label={s.replReason} select>
        <select value={remark} onChange={(e) => setRemark(e.target.value)}>
          <option value={REPLACEMENT_REMARKS[0]}>{s.reasonDamaged}</option>
          <option value={REPLACEMENT_REMARKS[1]}>{s.reasonUnreadable}</option>
        </select>
      </Outlined>
      {noFactory && <p className="form-msg error">{s.replNoFactory}</p>}
      {fail && <p className={`form-msg ${fail.tone}`}>{fail.text.replace(s.notSentPrefix(1), '')}</p>}
    </Dialog>
  );
}

// --- settings ----------------------------------------------------------------------

function Outlined({ label, help, select, children }: { label: string; help?: string; select?: boolean; children: ReactNode }) {
  return (
    <div className="outlined-wrap">
      <label className={`ofield${select ? ' select' : ''}`}>
        <span className="o-label">{label}</span>
        {children}
      </label>
      {help && <p className="o-help">{help}</p>}
    </div>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="set-section">
      <h3>
        <span className="set-ic">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={v} type="button" className={`m-btn ${value === v ? 'filled' : 'outlined'}`} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Check({ checked, disabled, onChange, children }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className={`check${disabled ? ' disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="box" aria-hidden="true" />
      <span>{children}</span>
    </label>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={`switch${checked ? ' on' : ''}`} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

const ICON = {
  scan: <svg viewBox="0 0 24 24"><path d="M3 3h6v2H5v4H3zm12 0h6v6h-2V5h-4zM3 15h2v4h4v2H3zm16 4h-4v2h6v-6h-2zM7 7h4v4H7zm6 0h4v4h-4zm-6 6h4v4H7zm8 0h2v2h-2zm-2 2h2v2h-2z" /></svg>,
  mode: <svg viewBox="0 0 24 24"><path d="M6.99 11 3 15l3.99 4v-3H14v-2H6.99zM21 9l-3.99-4v3H10v2h7.01v3z" /></svg>,
  cloud: <svg viewBox="0 0 24 24"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.99 5.99 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" /></svg>,
  doc: <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm2 16H8v-2h8zm0-4H8v-2h8zm-3-5V3.5L18.5 9z" /></svg>,
  bolt: <svg viewBox="0 0 24 24"><path d="M7 2v11h3v9l7-12h-4l4-8z" /></svg>,
  sound: <svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z" /></svg>,
  globe: <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.93 6h-2.95a15.65 15.65 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.93 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14a8.2 8.2 0 0 1 0-4h3.38a16.5 16.5 0 0 0 0 4zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.99 7.99 0 0 1 5.08 16zM8.03 8H5.08a7.99 7.99 0 0 1 4.33-3.56A15.65 15.65 0 0 0 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66a14.7 14.7 0 0 1 0-4h4.68a14.7 14.7 0 0 1 0 4zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14a16.5 16.5 0 0 0 0-4h3.38a8.2 8.2 0 0 1 0 4z" /></svg>,
  history: <svg viewBox="0 0 24 24"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 1 1 2.05 4.95l-1.42 1.42A9 9 0 1 0 13 3zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8z" /></svg>,
  reset: <svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z" /></svg>,
  save: <svg viewBox="0 0 24 24"><path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7zm-5 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm3-10H5V5h10z" /></svg>,
};

function SettingsScreen({
  sim,
  s,
  close,
  say,
  backRef,
}: {
  sim: RfidHandheldSimulator;
  s: AppStrings;
  close: () => void;
  say: (t: string) => void;
  backRef: { current: () => void };
}) {
  const [draft, setDraft] = useState<Config>(() => ({ ...sim.config }));
  const [dialog, setDialog] = useState<'reset' | 'unsaved' | 'log' | null>(null);
  const [urlOpen, setUrlOpen] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(sim.config);
  const set = (key: string, value: string | number | boolean) => setDraft((d) => ({ ...d, [key]: value }));
  const str = (k: string) => String(draft[k] ?? '');
  const st = sim.state;

  // The lists follow the Base URL being typed: at once when picked, ~1 s after typing stops.
  const base = str('baseUrl');
  useEffect(() => {
    if (!/^https?:\/\/\S+/.test(base) || st.masterFrom === base) return;
    const id = setTimeout(() => void sim.ensureMasterData(true, base), 1000);
    return () => clearTimeout(id);
  }, [base]); // eslint-disable-line react-hooks/exhaustive-deps

  // A code the new host does not know is cleared, so it never reaches that host.
  useEffect(() => {
    if (st.master !== 'ready' || st.masterFrom !== base) return;
    const rrs = sim.rrTypes();
    const codes = sim.factories().map((f) => f.code);
    setDraft((d) => ({
      ...d,
      rr_type: rrs.includes(String(d.rr_type)) ? d.rr_type : '',
      factory_code: codes.includes(String(d.factory_code)) ? d.factory_code : '',
    }));
  }, [st.master, st.masterFrom]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (): boolean => {
    if (!str('factory_code').trim()) {
      say(s.factoryRequired);
      return false;
    }
    sim.applyConfig(draft);
    setDraft({ ...sim.config });
    say(appStrings(String(draft.lang)).saved);
    return true;
  };
  const leave = () => (dirty ? setDialog('unsaved') : close());
  backRef.current = leave;

  const replacement = draft.mode === 'register' && draft.replacement === true;
  const year = new Date().getFullYear();
  const years = Array.from({ length: year - 1999 }, (_, i) => String(year - i));

  return (
    <>
      <AppBar title={s.settings} onBack={leave} />
      <div className="settings">
        <Section icon={ICON.scan} title={s.scanMode}>
          <Seg value="rfid" options={[['rfid', 'RFID'], ['barcode', 'Barcode']]} onChange={(v) => v === 'barcode' && say(s.barcodeSoon)} />
        </Section>

        <Section icon={ICON.mode} title={s.mode}>
          <Seg
            value={str('mode')}
            options={[['wo', 'WO'], ['register', 'Register']]}
            onChange={(v) => setDraft((d) => ({ ...d, mode: v, ...(v === 'wo' ? { replacement: false } : {}) }))}
          />
          <Check checked={draft.opname === true || replacement} disabled={replacement} onChange={(v) => set('opname', v)}>
            {s.opname}
          </Check>
          {draft.mode === 'register' && (
            <>
              <Check checked={replacement} onChange={(v) => setDraft((d) => ({ ...d, replacement: v, ...(v ? { opname: true } : {}) }))}>
                {s.replacement}
              </Check>
              <p className="set-help">{s.replacementHelp}</p>
            </>
          )}
        </Section>

        <Section icon={ICON.cloud} title={s.apiConfig}>
          <div className="url-combo">
            <Outlined label="Base URL" select>
              <input value={base} onChange={(e) => set('baseUrl', e.target.value)} spellCheck={false} />
            </Outlined>
            <button type="button" className="combo-arrow" aria-label="Base URL list" onClick={() => setUrlOpen((v) => !v)} />
            {urlOpen && (
              <ul className="menu url-menu">
                {BASE_URLS.map((u) => (
                  <li key={u}>
                    <button
                      type="button"
                      onClick={() => {
                        set('baseUrl', u);
                        setUrlOpen(false);
                        void sim.ensureMasterData(true, u);
                      }}
                    >
                      {u}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <MasterLine sim={sim} s={s} base={base} />
          <Outlined label="Endpoint" select>
            <select value={str('endpoint')} onChange={(e) => set('endpoint', e.target.value)}>
              {[...new Set([...ENDPOINTS, str('endpoint')])].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Outlined>
          <Outlined label="Reader ID">
            <input value={str('reader_id')} readOnly />
          </Outlined>
          <Outlined label="Antenna" select>
            <select value={str('antenna')} onChange={(e) => set('antenna', e.target.value)}>
              {Array.from({ length: 8 }, (_, i) => String(i + 1)).map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </Outlined>
        </Section>

        <Section icon={ICON.doc} title={s.registerConfig}>
          <Outlined label="RR Type" select>
            <select value={str('rr_type')} onChange={(e) => set('rr_type', e.target.value)}>
              <option value="" />
              {sim.rrTypes().map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Outlined>
          <Outlined label={s.makerName}>
            <input value={str('maker_name')} onChange={(e) => set('maker_name', e.target.value)} />
          </Outlined>
          <Outlined label={s.initialYear} select>
            <select value={str('initial_year')} onChange={(e) => set('initial_year', e.target.value)}>
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </Outlined>
          <Outlined label="Factory Code" select>
            <select value={str('factory_code')} onChange={(e) => set('factory_code', e.target.value)}>
              <option value="" />
              {sim.factories().map((f) => (
                <option key={f.code} value={f.code}>
                  {f.code}
                </option>
              ))}
            </select>
          </Outlined>
        </Section>

        <Section icon={ICON.bolt} title={s.power}>
          <p className="set-value">
            {s.level} {String(draft.power)}
          </p>
          <input type="range" className="slider" min={0} max={300} value={Number(draft.power)} onChange={(e) => set('power', Number(e.target.value))} />
        </Section>

        <Section icon={ICON.sound} title={s.sound}>
          <div className="toggle-row">
            <span>{s.soundHelp}</span>
            <Switch checked={draft.sound === true} onChange={(v) => set('sound', v)} />
          </div>
          <p className="set-value">{s.volume}</p>
          <input type="range" className="slider" min={0} max={100} value={Number(draft.volume)} onChange={(e) => set('volume', Number(e.target.value))} />
        </Section>

        <Section icon={ICON.globe} title={s.language}>
          <Seg value={str('lang')} options={[['en', 'English'], ['id', 'Indonesia']]} onChange={(v) => set('lang', v)} />
        </Section>

        <Section icon={ICON.history} title={s.logHistory}>
          <button type="button" className="m-btn outlined wide" onClick={() => setDialog('log')}>
            {ICON.history}
            {s.logHistory}
          </button>
        </Section>

        <p className="version">{s.version}</p>
      </div>

      <div className="save-bar">
        <button type="button" className="m-btn outlined" onClick={() => setDialog('reset')}>
          {ICON.reset}
          {s.reset}
        </button>
        <button type="button" className="m-btn filled" disabled={!dirty} onClick={save}>
          {ICON.save}
          {s.save}
        </button>
      </div>

      {dialog === 'reset' && (
        <Dialog
          title={s.resetTitle}
          actions={
            <>
              <button type="button" className="text-btn" onClick={() => setDialog(null)}>
                {s.cancel}
              </button>
              <button
                type="button"
                className="m-btn filled small danger"
                onClick={() => {
                  // Never the language: Reset leaves it alone, like the app.
                  setDraft({ ...sim.defaultConfig(), lang: draft.lang });
                  setDialog(null);
                }}
              >
                {s.reset}
              </button>
            </>
          }
        >
          <p className="dlg-body">{s.resetBody}</p>
        </Dialog>
      )}
      {dialog === 'unsaved' && (
        <Dialog
          title={s.unsavedTitle}
          actions={
            <>
              <button type="button" className="text-btn" onClick={() => setDialog(null)}>
                {s.cancel}
              </button>
              <button type="button" className="text-btn danger" onClick={close}>
                {s.discardShort}
              </button>
              <button
                type="button"
                className="m-btn filled small"
                onClick={() => {
                  setDialog(null);
                  if (save()) close();
                }}
              >
                {s.save}
              </button>
            </>
          }
        >
          <p className="dlg-body">{s.unsavedBody}</p>
        </Dialog>
      )}
      {dialog === 'log' && <LogDialog sim={sim} s={s} onClose={() => setDialog(null)} />}
    </>
  );
}

function MasterLine({ sim, s, base }: { sim: RfidHandheldSimulator; s: AppStrings; base: string }) {
  const st = sim.state;
  if (st.master === 'loading') return <p className="master-line">{s.fetching}</p>;
  if (st.master === 'failed')
    return (
      <div className="master-line failed">
        <div>
          <p className="error">{s.fetchFailed}</p>
          <p className="note">{s.fetchFailedNote}</p>
        </div>
        <button type="button" className="text-btn" onClick={() => void sim.ensureMasterData(true, base)}>
          {s.retry}
        </button>
      </div>
    );
  if (st.master === 'ready') return <p className="master-line ok">{s.connected(sim.rrTypes().length, sim.factories().length)}</p>;
  return null;
}

// --- riwayat log -------------------------------------------------------------------

function logLabel(e: SendLog, s: AppStrings): string {
  if (e.kind === 'replacement') return s.replacementLabel;
  return ['RFID', e.mode === 'register' ? 'Register' : 'WO', ...(e.opname ? ['Opname'] : [])].join(' · ');
}

const stamp = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

function LogDialog({ sim, s, onClose }: { sim: RfidHandheldSimulator; s: AppStrings; onClose: () => void }) {
  const [detail, setDetail] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<SendLog | null>(null);
  const log = sim.state.log;
  const shown = detail === null ? log : log.filter((e) => e.id === detail);

  const head = (e: SendLog) => (
    <>
      <p className="log-label">
        {logLabel(e, s)} <span className={e.ok ? 'ok' : 'bad'}>{e.ok ? s.logSent : s.logFailed}</span>
      </p>
      <p className="log-time">
        {stamp(e.at)} · {e.count} {s.tag}
      </p>
      {e.resentFrom && <p className="log-time">{s.resentFrom(stamp(e.resentFrom))}</p>}
    </>
  );

  return (
    <div className="app-scrim" role="dialog" aria-modal="true" aria-label={s.logHistory}>
      <div className="app-dialog log">
        <h2 className="light">{s.logHistory}</h2>
        <div className="log-list">
          {log.length === 0 && <p className="dlg-body">{s.logEmpty}</p>}
          {shown.map((e) => (
            <div key={e.id} className="log-entry">
              {head(e)}
              <div className="log-actions">
                <button type="button" className="text-btn" onClick={() => setDetail(detail === null ? e.id : null)}>
                  {detail === null ? s.detail : s.closeDetail}
                </button>
                {sim.canResend(e) && (
                  <button type="button" className="m-btn outlined small" onClick={() => setConfirm(e)}>
                    {s.resendLog}
                  </button>
                )}
              </div>
              {detail === e.id && (
                <dl className="log-detail">
                  <dt>{s.factoryCode}</dt>
                  <dd>{e.factoryCode || '—'}</dd>
                  <dt>{s.rrType}</dt>
                  <dd>{e.rrType || '—'}</dd>
                  <dt>{s.url}</dt>
                  <dd>{e.url}</dd>
                  <dt>{s.result}</dt>
                  <dd>{e.result}</dd>
                  <dt>{s.payload}</dt>
                  <dd className="mono">{JSON.stringify(e.payload)}</dd>
                </dl>
              )}
            </div>
          ))}
        </div>
        <div className="dlg-actions">
          <button type="button" className="text-btn" onClick={onClose}>
            {s.close}
          </button>
        </div>
      </div>
      {confirm && (
        <Dialog
          title={s.resendTitle}
          actions={
            <>
              <button type="button" className="text-btn" onClick={() => setConfirm(null)}>
                {s.cancel}
              </button>
              <button
                type="button"
                className="m-btn filled small"
                onClick={() => {
                  void sim.resendLog(confirm.id);
                  setConfirm(null);
                  setDetail(null);
                }}
              >
                {s.resendLog}
              </button>
            </>
          }
        >
          <p className="dlg-body">
            {s.resendBody}
            <br />
            <span className="url-text">{confirm.url}</span>
          </p>
          {confirm.ok && <p className="dlg-body error">{s.resendWarn}</p>}
        </Dialog>
      )}
    </div>
  );
}
