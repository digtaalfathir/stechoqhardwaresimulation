import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n';

export interface TourStep {
  /** CSS selector of what to point at; steps whose target is missing are dropped. */
  target: string;
  title: string;
  body: string;
}

const KEY = 'shs.tour';
const GAP = 12;
const PAD = 6;

function seenMap(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

/** Has this tour been shown (and finished or skipped) in this browser? */
export const tourSeen = (id: string) => !!seenMap()[id];

export function markTourSeen(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...seenMap(), [id]: true }));
  } catch {
    /* not remembered — the tour simply shows again next visit */
  }
}

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * A product tour: dims the page, cuts a spotlight around one element at a
 * time, and explains it in a card beside it. Esc skips, arrows step.
 */
export function Tour({ steps: all, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const t = useT();
  const [steps] = useState(() => all.filter((s) => document.querySelector(s.target)));
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  // Bring the target into view, then follow it while the page scrolls.
  useEffect(() => {
    if (!step) return;
    const el = document.querySelector(step.target);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const y = r.height < vh - 260 ? window.scrollY + r.top - (vh - r.height) / 2 + 60 : window.scrollY + r.top - 76;
    window.scrollTo({ top: Math.max(0, y), behavior: reduced() ? 'auto' : 'smooth' });
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    const late = setTimeout(measure, 450);
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    next.current?.focus({ preventScroll: true });
    return () => {
      clearTimeout(late);
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [step]);

  // The card goes below the target, else above, else over its lower edge.
  useLayoutEffect(() => {
    const c = card.current;
    if (!c) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = c.offsetWidth;
    const h = c.offsetHeight;
    if (!rect) {
      setPos({ top: (vh - h) / 2, left: (vw - w) / 2 });
      return;
    }
    const below = rect.bottom + PAD + GAP;
    const above = rect.top - PAD - GAP - h;
    const top = below + h < vh - 8 ? below : above > 64 ? above : Math.max(64, Math.min(vh - h - 16, rect.bottom - h - 16));
    const left = Math.max(12, Math.min(vw - w - 12, rect.left + Math.min(24, rect.width / 4)));
    setPos({ top, left });
  }, [rect, i]);

  // Keys belong to the tour while it is open: the devices listen for Space too.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.stopImmediatePropagation();
        return;
      }
      if (e.type !== 'keydown') return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, steps.length - 1));
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('keyup', key, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('keyup', key, true);
    };
  }, [onClose, steps.length]);

  // Nothing to point at (a page still loading): close instead of an empty card.
  useEffect(() => {
    if (!steps.length) onClose();
  }, [steps.length, onClose]);

  if (!step) return null;

  return (
    <div className="tour" role="presentation">
      <div className={`tour-dim${rect ? '' : ' solid'}`} />
      {rect && (
        <div
          className="tour-spot"
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
        />
      )}
      <div
        ref={card}
        className="tour-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
      >
        <div className="tour-top">
          <span className="tour-count">
            {i + 1} / {steps.length}
          </span>
          <button type="button" className="tour-skip" onClick={onClose}>
            {t('tour.skip', 'Skip tour')}
          </button>
        </div>
        <h3 id="tour-title">{step.title}</h3>
        <p id="tour-body">{step.body}</p>
        <div className="tour-foot">
          <span className="tour-dots" aria-hidden="true">
            {steps.map((_, k) => (
              <i key={k} className={k === i ? 'on' : k < i ? 'done' : ''} />
            ))}
          </span>
          {i > 0 && (
            <button type="button" className="btn btn-sm" onClick={() => setI(i - 1)}>
              {t('tour.back', 'Back')}
            </button>
          )}
          <button ref={next} type="button" className="btn btn-sm btn-primary" onClick={() => (last ? onClose() : setI(i + 1))}>
            {last ? t('tour.done', 'Got it') : t('tour.next', 'Next')}
          </button>
        </div>
      </div>
    </div>
  );
}
