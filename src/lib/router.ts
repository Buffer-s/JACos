import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'user'; permalink: string }
  | { name: 'playlist'; id: number }
  | { name: 'notfound' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  const segs = path.split('/').filter(Boolean);
  if (segs.length === 0) return { name: 'home' };
  if (segs[0] === 'user' && segs[1]) return { name: 'user', permalink: decodeURIComponent(segs[1]) };
  if (segs[0] === 'playlist' && segs[1] && /^\d+$/.test(segs[1])) return { name: 'playlist', id: Number(segs[1]) };
  return { name: 'notfound' };
}

export function navigate(path: string): void {
  window.location.hash = path;
}

export function useHashRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash || '#/');
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [hash]);
  return parseHash(hash);
}

/** Ask the TopNav to open the settings modal (used by banners on pages). */
export function openSettings(): void {
  window.dispatchEvent(new CustomEvent('jacos:open-settings'));
}
