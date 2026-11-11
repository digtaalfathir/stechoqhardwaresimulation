import { useEffect, useState } from 'react';
import { useT } from '../../lib/i18n';
import type { McPlcSimulator } from '../../simulators/plc/mc-plc';
import { CopyButton } from '../copy-button';
import { Icon } from '../icon';

/**
 * A page cannot start a program on the visitor's machine. What it can do is
 * open a link the OS hands to a registered program — stechoq-plc:// once
 * `mc-plc.mjs --install` has run. So: install once from a terminal, then Start
 * is one click. Without the install, the same command minus the flag runs the
 * bridge in the terminal instead.
 *
 * The download is the shell's job, not Node's: `fetch` only exists from Node 18
 * and the bridge runs on 14+. CMD shares the Linux line (curl ships with
 * Windows 10+); PowerShell aliases `curl` to something else, so it gets `irm`.
 */
const SHELLS = ['Linux / macOS', 'Windows CMD', 'Windows PowerShell'] as const;
type Shell = (typeof SHELLS)[number];

function startCommand(shell: Shell, file: string, flag: string): string {
  const run = `node mc-plc.mjs${flag}`;
  return shell === 'Windows PowerShell'
    ? `irm ${file} -OutFile mc-plc.mjs; ${run}`
    : `curl -fsSL ${file} -o mc-plc.mjs && ${run}`;
}

export function PlcStart({ sim }: { sim: McPlcSimulator }) {
  const t = useT();
  const file = new URL('mc-plc.mjs', location.href.split('#')[0]).href;
  // Windows 11 opens PowerShell by default, so that is the likelier guess there.
  const [shell, setShell] = useState<Shell>(() =>
    /Windows/i.test(navigator.userAgent) ? 'Windows PowerShell' : 'Linux / macOS',
  );
  // Nothing tells a page whether the link handler exists, so after a click that
  // starts nothing within a few seconds, point at the install step.
  const [clicked, setClicked] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!clicked) return;
    const id = setTimeout(() => tick((n) => n + 1), 6000);
    return () => clearTimeout(id);
  }, [clicked]);
  const nothingHappened = clicked > 0 && Date.now() - clicked >= 6000;

  const box = (cmd: string) => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
      <code className="mono" style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontSize: 12.5, padding: '6px 8px', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius)' }}>
        {cmd}
      </code>
      <CopyButton text={cmd} />
    </div>
  );

  return (
    <div className="panel-body">
      <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, marginBottom: 10, flexWrap: 'wrap' }}>
        <Icon name="plug" size={14} />
        {t('plc.down', 'The PLC is not running on this computer yet.')}
        <a className="btn btn-primary" href="stechoq-plc://start" onClick={() => setClicked(Date.now())}>
          <Icon name="bolt" size={14} />
          {t('plc.start.button', 'Start PLC')}
        </a>
        {clicked > 0 && !nothingHappened && <span className="chip">{t('plc.starting', 'starting…')}</span>}
      </p>
      <p className={nothingHappened ? 't-warn' : 'muted'} style={{ fontSize: 13, marginBottom: 8 }}>
        {nothingHappened
          ? t('plc.start.none', 'Nothing started — this computer needs the one-time install first. Run this in a terminal (Node 14+), then press Start PLC again:')
          : t('plc.start.first', 'First time on this computer? Run this once in a terminal (Node 14+, Windows or Linux). After that, Start PLC is all it takes:')}
      </p>
      <div className="segmented" role="group" aria-label={t('plc.shell', 'Terminal')} style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginBottom: 8 }}>
        {SHELLS.map((s) => (
          <button key={s} type="button" aria-pressed={shell === s} onClick={() => setShell(s)}>
            {s}
          </button>
        ))}
      </div>
      {box(startCommand(shell, file, ' --install'))}
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>
        {t('plc.start.noinstall', 'Rather not install, or on macOS? This runs it without installing — the PLC lives as long as that terminal window:')}
      </p>
      {box(startCommand(shell, file, ''))}
      <p className="muted" style={{ fontSize: 12.5 }}>
        {t('plc.start.alt', 'Prefer the browser? Download the file, then run')} <code>node mc-plc.mjs</code>{' '}
        {t('plc.start.alt.b', 'in the folder you saved it to.')}{' '}
        <a className="btn btn-sm" href={file} download="mc-plc.mjs">
          {t('plc.download', 'Download mc-plc.mjs')}
        </a>
      </p>
      {sim.cfg('bridgeUrl') !== 'http://localhost:8201' && (
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          {sim.cfg('bridgeUrl')} · {sim.state.bridgeError}
        </p>
      )}
    </div>
  );
}
