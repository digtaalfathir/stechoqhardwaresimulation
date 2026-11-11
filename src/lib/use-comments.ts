import { useState } from 'react';

/** Comments are a label for people, kept in this browser only, one store per key. */
export function useComments(storeKey: string): [Record<string, string>, (key: string, text: string) => void] {
  const [comments, setComments] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(storeKey) ?? '{}') as Record<string, string>;
    } catch {
      return {};
    }
  });
  const set = (key: string, text: string) =>
    setComments((c) => {
      const next = { ...c, [key]: text };
      if (!text) delete next[key];
      try {
        localStorage.setItem(storeKey, JSON.stringify(next));
      } catch {
        /* not persisted — still works for this visit */
      }
      return next;
    });
  return [comments, set];
}
