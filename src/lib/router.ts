import { useEffect, useState } from 'react';

export type Route =
  | { name: 'browse' }
  | { name: 'library' }
  | { name: 'playlists' }
  | { name: 'playlist'; id: string }
  | { name: 'communities' }
  | { name: 'community'; slug: string }
  | { name: 'join'; code: string }
  | { name: 'import'; from?: string | null }
  | { name: 'edit'; id: string }
  | { name: 'song'; id: string }
  | { name: 'profile' };

function parseHash(raw: string): Route {
  const h = raw.replace(/^#\/?/, '').split('?')[0];
  const params = new URLSearchParams(raw.split('?')[1] || '');
  if (h === '' || h === 'browse') return { name: 'browse' };
  if (h === 'library') return { name: 'library' };
  if (h === 'playlists') return { name: 'playlists' };
  if (h === 'communities') return { name: 'communities' };
  if (h === 'profile') return { name: 'profile' };
  if (h === 'import') return { name: 'import', from: params.get('from') };
  if (h.startsWith('playlist/'))  return { name: 'playlist',  id: decodeURIComponent(h.slice(9)) };
  if (h.startsWith('community/')) return { name: 'community', slug: decodeURIComponent(h.slice(10)) };
  if (h.startsWith('join/'))      return { name: 'join',      code: decodeURIComponent(h.slice(5)) };
  if (h.startsWith('edit/'))      return { name: 'edit',      id: decodeURIComponent(h.slice(5)) };
  if (h.startsWith('song/'))      return { name: 'song',      id: decodeURIComponent(h.slice(5)) };
  return { name: 'browse' };
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(route: Route): void {
  let hash = '';
  switch (route.name) {
    case 'browse':      hash = '#/browse'; break;
    case 'library':     hash = '#/library'; break;
    case 'playlists':   hash = '#/playlists'; break;
    case 'playlist':    hash = `#/playlist/${encodeURIComponent(route.id)}`; break;
    case 'communities': hash = '#/communities'; break;
    case 'community':   hash = `#/community/${encodeURIComponent(route.slug)}`; break;
    case 'profile':     hash = '#/profile'; break;
    case 'join':        hash = `#/join/${encodeURIComponent(route.code)}`; break;
    case 'import':      hash = '#/import' + (route.from ? `?from=${encodeURIComponent(route.from)}` : ''); break;
    case 'edit':        hash = `#/edit/${encodeURIComponent(route.id)}`; break;
    case 'song':        hash = `#/song/${encodeURIComponent(route.id)}`; break;
  }
  if (window.location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
}

export function navigateBack(fallback: Route = { name: 'browse' }): void {
  if (window.history.length > 1) window.history.back();
  else navigate(fallback);
}
