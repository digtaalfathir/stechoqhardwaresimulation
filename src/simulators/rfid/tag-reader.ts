import { Simulator } from '../core/simulator';
import type { TransportResponse } from '../core/types';
import { httpPost, postJson, randomEpc, withResponse } from '../core/wire';

/** Swapped out by the self-check so it never touches the network. */
export type Sender = (url: string, body: unknown) => Promise<TransportResponse>;

export const BASE_URLS = ['https://wms.suite.stechoq-j.com', 'https://product.suite.stechoq-j.com'];

export interface TagReaderState {
  scanning: boolean;
  /** Raw textarea content. Edited live, outside Apply Configuration. */
  tagsText: string;
  sendCount: number;
  okCount: number;
  failCount: number;
  skipped: number;
  sending: boolean;
  lastSentAt: string | null;
  lastResponse: TransportResponse | null;
  lastUrl: string | null;
}

/**
 * Shared behaviour of the RFID readers: a live tag list, a base URL joined to an
 * endpoint, and one real POST per sweep whose response is kept for the result
 * panel. What differs between a handheld and a gate is only *which* tags each
 * sweep carries, so that is all a subclass has to write.
 */
export abstract class TagReader<S extends TagReaderState = TagReaderState> extends Simulator<S> {
  /** Overridable so tests never hit the network. */
  sender: Sender = postJson;
  protected inFlight = false;

  protected baseState(tagsText: string): TagReaderState {
    this.inFlight = false;
    return {
      scanning: false,
      tagsText,
      sendCount: 0,
      okCount: 0,
      failCount: 0,
      skipped: 0,
      sending: false,
      lastSentAt: null,
      lastResponse: null,
      lastUrl: null,
    };
  }

  // --- tag list (live, outside the config form) ----------------------------

  /** Parsed tag list: one EPC per line, blanks dropped. */
  tags(): string[] {
    return this.state.tagsText
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  /** Bound directly to the textarea — takes effect on the next sweep. */
  setTagsText(text: string) {
    this.setState({ tagsText: text } as Partial<S>);
  }

  addRandomTag() {
    const idHex = randomEpc();
    const text = this.state.tagsText.replace(/\s+$/, '');
    this.setTagsText(text ? `${text}\n${idHex}` : idHex);
    this.emit('TAG_GENERATED', { idHex, tag_count: this.tags().length }, {
      tone: 'neutral',
      summary: `Added ${idHex} to the tag list`,
    });
  }

  /**
   * How much of the tag list this run has reported so far. Devices that read
   * everything in one sweep have nothing to show and return null.
   */
  coverage(): { covered: number; total: number } | null {
    return null;
  }

  // --- sending -------------------------------------------------------------

  url(): string {
    const base = this.cfg('baseUrl').replace(/\/+$/, '');
    const path = this.cfg('endpoint');
    if (!path) return base;
    return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  /**
   * One real POST. Counters, the stored response and the logged event are the
   * same for every send; the caller only says what it is sending and where.
   * Returns whether the endpoint accepted it, so a form can stay open on failure.
   */
  protected async dispatch(
    payload: Record<string, unknown>,
    opts: {
      /** Leads the event summary, e.g. "6 tag(s)" or "Replacement". */
      label: string;
      note?: string;
      /** Defaults to the configured base URL + endpoint. */
      url?: string;
      events?: { ok: string; fail: string };
    },
  ): Promise<boolean> {
    // A slow endpoint must not stack up requests behind a fast interval.
    if (this.inFlight) {
      this.setState({ skipped: this.state.skipped + 1 } as Partial<S>);
      return false;
    }
    const url = opts.url ?? this.url();
    this.inFlight = true;
    this.setState({
      sending: true,
      sendCount: this.state.sendCount + 1,
      lastSentAt: String(payload.timestamp ?? new Date().toISOString()),
      lastUrl: url,
    } as Partial<S>);

    const res = await this.sender(url, payload);
    this.inFlight = false;
    this.setState({
      sending: false,
      lastResponse: res,
      okCount: this.state.okCount + (res.ok ? 1 : 0),
      failCount: this.state.failCount + (res.ok ? 0 : 1),
    } as Partial<S>);

    const outcome = res.error ? 'request blocked or unreachable' : `${res.status} ${res.statusText}`.trim();
    const events = opts.events ?? { ok: 'RFID_SENT', fail: 'RFID_SEND_FAILED' };
    // The payload stays exactly the request body — copyable and identical to
    // what your backend receives. The response lives on the frame.
    this.emit(res.ok ? events.ok : events.fail, payload, {
      tone: res.ok ? 'ok' : 'error',
      summary: `${opts.label}${opts.note ? ` · ${opts.note}` : ''} → ${outcome}`,
      transport: withResponse(httpPost(url, payload), res),
    });
    return res.ok;
  }

  /** Empty: every value is already shown in the configuration and send result. */
  stateRows() {
    return [];
  }
}

export function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function sample<T>(items: T[], count: number): T[] {
  if (count <= 0 || items.length === 0) return [];
  return shuffle(items).slice(0, Math.min(count, items.length));
}
