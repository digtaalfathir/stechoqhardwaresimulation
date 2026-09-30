import { Simulator } from '../core/simulator';
import { randomEpc } from '../core/wire';

export type { Sender } from '../core/types';

/** Both readers log their sends under the same pair of event names. */
export const RFID_EVENTS = { ok: 'RFID_SENT', fail: 'RFID_SEND_FAILED' };

export const BASE_URLS = ['https://wms.suite.stechoq-j.com', 'https://product.suite.stechoq-j.com'];

export interface TagReaderState {
  scanning: boolean;
  /** Raw textarea content. Edited live, outside Apply Configuration. */
  tagsText: string;
}

/**
 * Shared behaviour of the RFID readers: a live tag list, a base URL joined to an
 * endpoint, and one real POST per sweep whose response is kept for the result
 * panel. What differs between a handheld and a gate is only *which* tags each
 * sweep carries, so that is all a subclass has to write.
 */
export abstract class TagReader<S extends TagReaderState = TagReaderState> extends Simulator<S> {
  protected baseState(tagsText: string): TagReaderState {
    return { scanning: false, tagsText };
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
