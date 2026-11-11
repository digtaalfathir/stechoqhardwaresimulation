import type { AnySimulator } from '../simulators/registry';
import { useT, type Translate } from '../lib/i18n';
import type { TransportResponse } from '../simulators/core/types';

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
export function SendResult({ sim }: { sim: AnySimulator }) {
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
    <section className="panel span-2" data-tour="send">
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
