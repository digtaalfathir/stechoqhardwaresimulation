import { useEffect, useState } from 'react';

/**
 * Hash routing. Static hosting (Cloudflare Pages) then needs no SPA rewrite
 * rules, and deep links to a simulator survive a hard refresh.
 */
export interface Route {
  path: string;
  segments: string[];
}

function read(): Route {
  const path = window.location.hash.replace(/^#/, '') || '/';
  return { path, segments: path.split('/').filter(Boolean) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path: string) {
  window.location.hash = path;
}

export function href(path: string): string {
  return `#${path}`;
}
